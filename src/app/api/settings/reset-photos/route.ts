import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/settings/reset-photos
 * Delete ALL documentation photos + SpjPhoto + StoredFile for the active year.
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
        { error: "Pilih tahun terlebih dahulu sebelum menghapus foto" },
        { status: 400 }
      );
    }

    // Verify year exists
    const year = await db.spjYear.findUnique({ where: { id: yearId } });
    if (!year) {
      return NextResponse.json({ error: "Tahun tidak ditemukan" }, { status: 404 });
    }

    // Get all photo URLs for this year (to delete StoredFile records later)
    const docPhotos = await db.documentationPhoto.findMany({
      where: { yearId },
      select: { id: true, url: true },
    });

    const spjPhotos = await db.spjPhoto.findMany({
      where: { order: { yearId } },
      select: { id: true, url: true },
    });

    // Collect all file URLs (/api/file/{id})
    const allUrls = [...docPhotos.map((p) => p.url), ...spjPhotos.map((p) => p.url)];
    const fileIds = allUrls
      .filter((url) => url.startsWith("/api/file/"))
      .map((url) => url.replace("/api/file/", "").split("?")[0]);

    // Delete in order: PhotoOrderLink → SpjPhoto → DocumentationPhoto → StoredFile
    // PhotoOrderLink: for orders in this year
    const orderIds = await db.spjOrder.findMany({
      where: { yearId },
      select: { id: true },
    });
    const orderIdList = orderIds.map((o) => o.id);

    const linksDeleted = await db.photoOrderLink.deleteMany({
      where: { orderId: { in: orderIdList } },
    });

    const spjPhotosDeleted = await db.spjPhoto.deleteMany({
      where: { orderId: { in: orderIdList } },
    });

    const docPhotosDeleted = await db.documentationPhoto.deleteMany({
      where: { yearId },
    });

    // Delete StoredFile records (actual image data in database)
    let storedFilesDeleted = 0;
    if (fileIds.length > 0) {
      const result = await db.storedFile.deleteMany({
        where: { id: { in: fileIds } },
      });
      storedFilesDeleted = result.count;
    }

    return NextResponse.json({
      success: true,
      message: `Berhasil hapus semua foto tahun ${year.year}`,
      deleted: {
        docPhotos: docPhotosDeleted.count,
        spjPhotos: spjPhotosDeleted.count,
        photoLinks: linksDeleted.count,
        storedFiles: storedFilesDeleted,
      },
    });
  } catch (err) {
    console.error("POST /api/settings/reset-photos error:", err);
    return NextResponse.json(
      { error: "Gagal menghapus foto: " + (err instanceof Error ? err.message : "unknown") },
      { status: 500 }
    );
  }
}
