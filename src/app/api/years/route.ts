import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/years
 * List all years (ordered by year DESC) with orderCount per year.
 */
export async function GET() {
  try {
    const years = await db.spjYear.findMany({
      orderBy: { year: "desc" },
      select: {
        id: true,
        year: true,
        isActive: true,
        label: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { orders: true } },
      },
    });

    return NextResponse.json({
      years: years.map((y) => ({
        id: y.id,
        year: y.year,
        isActive: y.isActive,
        label: y.label,
        orderCount: y._count.orders,
        createdAt: y.createdAt,
        updatedAt: y.updatedAt,
      })),
    });
  } catch (err) {
    console.error("GET /api/years error:", err);
    return NextResponse.json(
      { error: "Gagal memuat daftar tahun" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/years
 * Create a new year (admin only).
 * Body: { year: number, label?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin();
    if (!user) {
      return NextResponse.json(
        { error: "Akses ditolak. Admin only." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body.year !== "number") {
      return NextResponse.json(
        { error: "Field 'year' (number) wajib diisi" },
        { status: 400 }
      );
    }

    const year = Number(body.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: "Tahun harus berupa integer antara 2000-2100" },
        { status: 400 }
      );
    }

    const label =
      typeof body.label === "string" && body.label.trim()
        ? body.label.trim()
        : null;

    // Check uniqueness
    const existing = await db.spjYear.findUnique({ where: { year } });
    if (existing) {
      return NextResponse.json(
        { error: "Tahun sudah ada" },
        { status: 400 }
      );
    }

    const created = await db.spjYear.create({
      data: { year, label },
      select: {
        id: true,
        year: true,
        isActive: true,
        label: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ year: created }, { status: 201 });
  } catch (err) {
    console.error("POST /api/years error:", err);
    return NextResponse.json(
      { error: "Gagal membuat tahun" },
      { status: 500 }
    );
  }
}
