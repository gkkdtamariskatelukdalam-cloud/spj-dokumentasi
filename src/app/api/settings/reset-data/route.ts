import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/settings/reset-data
 * Delete ALL orders + items for the active year (but NOT photos).
 * Admin only.
 *
 * Body: { yearId: string } — required, must not be "all"
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin();
    if (!user) {
      return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const yearId = body.yearId;

    if (!yearId || yearId === "all") {
      return NextResponse.json(
        { error: "Pilih tahun terlebih dahulu sebelum menghapus data" },
        { status: 400 }
      );
    }

    // Verify year exists
    const year = await db.spjYear.findUnique({ where: { id: yearId } });
    if (!year) {
      return NextResponse.json({ error: "Tahun tidak ditemukan" }, { status: 404 });
    }

    // Get order IDs for this year
    const orders = await db.spjOrder.findMany({
      where: { yearId },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);

    if (orderIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: `Tidak ada data belanja untuk tahun ${year.year}`,
        deleted: { orders: 0, items: 0, photoLinks: 0, spjPhotos: 0 },
      });
    }

    // Delete in order: PhotoOrderLink → SpjPhoto → SpjItem → SpjOrder
    // Note: DocumentationPhoto (library) is NOT deleted — only the link to orders
    const linksDeleted = await db.photoOrderLink.deleteMany({
      where: { orderId: { in: orderIds } },
    });

    const spjPhotosDeleted = await db.spjPhoto.deleteMany({
      where: { orderId: { in: orderIds } },
    });

    const itemsDeleted = await db.spjItem.deleteMany({
      where: { orderId: { in: orderIds } },
    });

    const ordersDeleted = await db.spjOrder.deleteMany({
      where: { id: { in: orderIds } },
    });

    return NextResponse.json({
      success: true,
      message: `Berhasil hapus semua data belanja tahun ${year.year}`,
      deleted: {
        orders: ordersDeleted.count,
        items: itemsDeleted.count,
        photoLinks: linksDeleted.count,
        spjPhotos: spjPhotosDeleted.count,
      },
    });
  } catch (err) {
    console.error("POST /api/settings/reset-data error:", err);
    return NextResponse.json(
      { error: "Gagal menghapus data: " + (err instanceof Error ? err.message : "unknown") },
      { status: 500 }
    );
  }
}
