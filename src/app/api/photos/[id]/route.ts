import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { unlink } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/photos/[id]
 * 
 * Handle deletion from BOTH sources (merged photo system):
 *   1. SpjPhoto (legacy) — find by id, delete record + file
 *   2. DocumentationPhoto (new many-to-many) — find by id, delete record + file + all PhotoOrderLink
 * 
 * Also clean up cross-references:
 *   - If SpjPhoto found, also delete matching DocumentationPhoto (by filePath) + PhotoOrderLink
 *   - If DocumentationPhoto found, also delete matching SpjPhoto (by filePath)
 * 
 * This ensures no orphaned records remain in either table.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // ===== Source 1: Try SpjPhoto (legacy) =====
    const spjPhoto = await db.spjPhoto.findUnique({ where: { id } }).catch(() => null);

    if (spjPhoto) {
      // Delete file from disk
      try {
        const absPath = join(process.cwd(), "public", spjPhoto.filePath);
        await unlink(absPath);
      } catch {
        // ignore missing file
      }

      // Delete SpjPhoto record
      await db.spjPhoto.delete({ where: { id } }).catch(() => {});

      // Also delete matching DocumentationPhoto (by filePath) + PhotoOrderLink
      const docPhoto = await db.documentationPhoto.findFirst({
        where: { filePath: spjPhoto.filePath },
      }).catch(() => null);

      if (docPhoto) {
        // PhotoOrderLink will cascade delete when DocumentationPhoto is deleted
        await db.documentationPhoto.delete({ where: { id: docPhoto.id } }).catch(() => {});
      }

      return NextResponse.json({ success: true });
    }

    // ===== Source 2: Try DocumentationPhoto (new system) =====
    const docPhoto = await db.documentationPhoto.findUnique({ where: { id } }).catch(() => null);

    if (docPhoto) {
      // Delete file from disk
      try {
        const absPath = join(process.cwd(), "public", docPhoto.filePath);
        await unlink(absPath);
      } catch {
        // ignore missing file
      }

      // Delete DocumentationPhoto (cascade will delete all PhotoOrderLink)
      await db.documentationPhoto.delete({ where: { id } }).catch(() => {});

      // Also delete matching SpjPhoto (by filePath) if exists
      await db.spjPhoto.deleteMany({
        where: { filePath: docPhoto.filePath },
      }).catch(() => {});

      return NextResponse.json({ success: true });
    }

    // ===== Not found in either source =====
    return NextResponse.json(
      { error: "Foto tidak ditemukan" },
      { status: 404 }
    );
  } catch (err) {
    console.error("DELETE /api/photos/[id] error:", err);
    return NextResponse.json(
      { error: "Gagal menghapus foto" },
      { status: 500 }
    );
  }
}
