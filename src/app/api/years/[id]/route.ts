import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PUT /api/years/[id]
 * Update year (admin only). Body: { label?, isActive? }
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin();
    if (!user) {
      return NextResponse.json(
        { error: "Akses ditolak. Admin only." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Body request tidak valid" },
        { status: 400 }
      );
    }

    const existing = await db.spjYear.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Tahun tidak ditemukan" },
        { status: 404 }
      );
    }

    const data: { label?: string | null; isActive?: boolean } = {};
    if (typeof body.label === "string") {
      data.label = body.label.trim() || null;
    } else if (body.label === null) {
      data.label = null;
    }
    if (typeof body.isActive === "boolean") {
      data.isActive = body.isActive;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "Tidak ada field yang di-update" },
        { status: 400 }
      );
    }

    const updated = await db.spjYear.update({
      where: { id },
      data,
      select: {
        id: true,
        year: true,
        isActive: true,
        label: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ year: updated });
  } catch (err) {
    console.error("PUT /api/years/[id] error:", err);
    return NextResponse.json(
      { error: "Gagal memperbarui tahun" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/years/[id]
 * Delete year (admin only).
 * CRITICAL: Cannot delete if year has orders (orderCount > 0).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin();
    if (!user) {
      return NextResponse.json(
        { error: "Akses ditolak. Admin only." },
        { status: 403 }
      );
    }

    const { id } = await params;

    const existing = await db.spjYear.findUnique({
      where: { id },
      select: { id: true, year: true, _count: { select: { orders: true } } },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Tahun tidak ditemukan" },
        { status: 404 }
      );
    }

    if (existing._count.orders > 0) {
      return NextResponse.json(
        {
          error: "Tidak dapat menghapus tahun yang masih memiliki data",
        },
        { status: 400 }
      );
    }

    await db.spjYear.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: `Tahun ${existing.year} berhasil dihapus`,
    });
  } catch (err) {
    console.error("DELETE /api/years/[id] error:", err);
    return NextResponse.json(
      { error: "Gagal menghapus tahun" },
      { status: 500 }
    );
  }
}
