import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { unlink } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/documentation/[id]
 *
 * Delete a documentation photo. Removes the file from disk and the DB
 * record. Cascading delete on the schema will automatically remove any
 * PhotoOrderLink rows pointing at this photo.
 *
 * Returns: { success: true }
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const photo = await db.documentationPhoto.findUnique({ where: { id } });
    if (!photo) {
      return NextResponse.json(
        { error: "Foto dokumentasi tidak ditemukan" },
        { status: 404 }
      );
    }

    // delete file from disk if exists. photo.filePath stores the
    // public-relative URL ("/uploads/doc/uuid.ext"); convert it to an
    // absolute filesystem path under /public.
    try {
      const absPath = join(process.cwd(), "public", photo.filePath);
      await unlink(absPath);
    } catch {
      // ignore missing file on disk
    }

    // DB delete — cascade removes PhotoOrderLink rows automatically
    await db.documentationPhoto.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/documentation/[id] error:", err);
    return NextResponse.json(
      { error: "Gagal menghapus foto dokumentasi" },
      { status: 500 }
    );
  }
}
