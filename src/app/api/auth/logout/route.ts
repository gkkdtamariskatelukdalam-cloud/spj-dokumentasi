import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/logout
 *
 * Destroys the session cookie.
 */
export async function POST() {
  try {
    await destroySession();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/auth/logout error:", err);
    return NextResponse.json(
      { error: "Gagal melakukan logout" },
      { status: 500 }
    );
  }
}
