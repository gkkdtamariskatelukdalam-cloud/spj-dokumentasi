import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const ACTIVE_YEAR_COOKIE = "spj_active_year";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days (same as session)

/**
 * GET /api/years/active
 * Return the "active year" for the current session.
 * - If cookie `spj_active_year` is set and value is "all": return { year: null } (Semua Tahun mode)
 * - If cookie is set and value matches a year id: return that year
 * - If cookie is not set or year not found: return the most recent active year
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(ACTIVE_YEAR_COOKIE)?.value;

    // "Semua Tahun" mode
    if (cookieValue === "all") {
      return NextResponse.json({ year: null, mode: "all" });
    }

    if (cookieValue) {
      const found = await db.spjYear.findUnique({
        where: { id: cookieValue },
        select: { id: true, year: true, label: true, isActive: true },
      });
      if (found) {
        return NextResponse.json({ year: found, mode: "year" });
      }
    }

    // Fallback: most recent active year
    const latest = await db.spjYear.findFirst({
      where: { isActive: true },
      orderBy: { year: "desc" },
      select: { id: true, year: true, label: true, isActive: true },
    });

    return NextResponse.json({
      year: latest,
      mode: latest ? "year" : "all",
    });
  } catch (err) {
    console.error("GET /api/years/active error:", err);
    return NextResponse.json(
      { error: "Gagal memuat tahun aktif" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/years/active
 * Set the active year via cookie.
 * Body: { yearId: string } — set to a specific year id
 * Body: { yearId: "all" } — set to "Semua Tahun" mode
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.yearId !== "string") {
      return NextResponse.json(
        { error: "Field 'yearId' (string) wajib diisi" },
        { status: 400 }
      );
    }

    const yearId = body.yearId;
    const cookieStore = await cookies();

    if (yearId === "all") {
      cookieStore.set(ACTIVE_YEAR_COOKIE, "all", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: COOKIE_MAX_AGE,
      });
      return NextResponse.json({ success: true, year: null, mode: "all" });
    }

    // Validate the year id exists
    const found = await db.spjYear.findUnique({
      where: { id: yearId },
      select: { id: true, year: true, label: true, isActive: true },
    });
    if (!found) {
      return NextResponse.json(
        { error: "Tahun tidak ditemukan" },
        { status: 404 }
      );
    }

    cookieStore.set(ACTIVE_YEAR_COOKIE, yearId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });

    return NextResponse.json({ success: true, year: found, mode: "year" });
  } catch (err) {
    console.error("POST /api/years/active error:", err);
    return NextResponse.json(
      { error: "Gagal mengatur tahun aktif" },
      { status: 500 }
    );
  }
}
