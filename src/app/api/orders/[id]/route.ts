import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Auto-sync orphaned files: if there are photo files on disk for this order
 * but no DB records, restore them to DB. This prevents data loss when
 * (for any reason) DB records get deleted but files remain.
 *
 * Returns the list of restored photo URLs (empty if nothing to restore).
 */
async function syncOrphanedFiles(orderId: string): Promise<number> {
  try {
    // Clean up orphaned PhotoOrderLink records (photo deleted but link remains)
    // This prevents "Inconsistent query result: Field photo is required" error
    await db.photoOrderLink.deleteMany({
      where: {
        orderId,
        photo: { is: null },
      },
    }).catch(() => {
      // ignore if query fails (relation might not exist yet)
    });

    const folderPath = join(process.cwd(), "public", "uploads", orderId);
    let files: string[];
    try {
      files = await readdir(folderPath);
    } catch {
      return 0; // folder doesn't exist
    }

    if (files.length === 0) return 0;

    // Get existing DB records for this order
    const existing = await db.spjPhoto.findMany({
      where: { orderId },
      select: { filePath: true },
    });
    const dbPaths = new Set(existing.map((p) => p.filePath));

    // Find orphaned files (on disk but not in DB)
    const orphaned: Array<{ fileName: string; url: string; size: number }> = [];
    for (const fileName of files) {
      const url = `/uploads/${orderId}/${fileName}`;
      if (!dbPaths.has(url)) {
        try {
          const fileStat = await stat(join(folderPath, fileName));
          orphaned.push({ fileName, url, size: fileStat.size });
        } catch {
          // file might have been deleted concurrently; skip
        }
      }
    }

    if (orphaned.length === 0) return 0;

    // Restore orphaned files to DB
    for (const f of orphaned) {
      const ext = f.fileName.toLowerCase().split(".").pop() || "jpg";
      const mime =
        ext === "png"
          ? "image/png"
          : ext === "webp"
          ? "image/webp"
          : ext === "heic"
          ? "image/heic"
          : "image/jpeg";

      await db.spjPhoto.create({
        data: {
          id: randomUUID(),
          orderId,
          fileName: f.fileName,
          filePath: f.url,
          url: f.url,
          fileSize: f.size,
          mimeType: mime,
          deviceType: "upload",
          source: "laptop",
        },
      });
    }

    console.log(
      `[syncOrphanedFiles] Restored ${orphaned.length} orphaned photos for order ${orderId}`
    );
    return orphaned.length;
  } catch (err) {
    console.error("[syncOrphanedFiles] error:", err);
    return 0;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Auto-sync orphaned files BEFORE fetching order (so photos appear)
    // This fixes the bug where DB records were lost but files remained.
    await syncOrphanedFiles(id);

    const order = await db.spjOrder.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { createdAt: "asc" },
        },
        photoLinks: {
          include: { photo: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!order) {
      return NextResponse.json(
        { error: "Order tidak ditemukan" },
        { status: 404 }
      );
    }

    // Photos: only from DocumentationPhoto via PhotoOrderLink (many-to-many)
    // SpjPhoto (legacy) is no longer used — all photos migrated to DocumentationPhoto
    // Only count photos that actually exist (filter out orphaned links)
    const mergedPhotos: Array<{
      id: string;
      url: string;
      fileName: string;
      fileSize: number;
      deviceType: string;
      source: string;
      caption: string | null;
      createdAt: Date;
    }> = [];

    for (const link of order.photoLinks) {
      if (!link.photo) continue; // skip orphaned links (photo deleted)
      mergedPhotos.push({
        id: link.photo.id,
        url: link.photo.url,
        fileName: link.photo.fileName,
        fileSize: link.photo.fileSize,
        deviceType: link.photo.deviceType,
        source: link.photo.source,
        caption: link.photo.caption,
        createdAt: link.createdAt,
      });
    }

    return NextResponse.json({
      order: {
        id: order.id,
        noPesanan: order.noPesanan,
        noBku: order.noBku,
        kodeProgram: order.kodeProgram,
        kodeRekening: order.kodeRekening,
        tanggalPesanan: order.tanggalPesanan,
        tanggalBast: order.tanggalBast,
        tanggalBayar: order.tanggalBayar,
        uraianKegiatan: order.uraianKegiatan,
        kategoriBelanja: order.kategoriBelanja,
        namaToko: order.namaToko,
        alamatToko: order.alamatToko,
        direkturToko: order.direkturToko,
        noHp: order.noHp,
        items: order.items.map((it) => ({
          id: it.id,
          namaBarang: it.namaBarang,
          volume: it.volume,
          satuan: it.satuan,
          hargaSatuan: it.hargaSatuan,
          jumlah: it.jumlah,
          spesifikasi: it.spesifikasi,
          kategori: it.kategori,
          uraian: it.uraian,
        })),
        photos: mergedPhotos.map((p) => ({
          id: p.id,
          url: p.url,
          fileName: p.fileName,
          fileSize: p.fileSize,
          deviceType: p.deviceType,
          source: p.source,
          caption: p.caption,
          createdAt: p.createdAt,
        })),
        status:
          mergedPhotos.length >= 2
            ? "complete"
            : mergedPhotos.length > 0
            ? "incomplete"
            : "empty",
      },
    });
  } catch (err) {
    console.error("GET /api/orders/[id] error:", err);
    return NextResponse.json(
      { error: "Gagal memuat detail order" },
      { status: 500 }
    );
  }
}
