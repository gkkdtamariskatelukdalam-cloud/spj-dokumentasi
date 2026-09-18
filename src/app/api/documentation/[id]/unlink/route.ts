import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/documentation/[id]/unlink
 * Body: { orderId: string }
 *
 * Remove the link between a documentation photo and an order.
 * Only the PhotoOrderLink row is deleted; the photo itself and the
 * order itself are untouched.
 *
 * Returns: { success: true }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    let body: { orderId?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Body request tidak valid (harus JSON)" },
        { status: 400 }
      );
    }

    const orderId =
      typeof body.orderId === "string" ? body.orderId.trim() : "";
    if (!orderId) {
      return NextResponse.json(
        { error: "orderId wajib diisi" },
        { status: 400 }
      );
    }

    // Verify the photo exists (return 404 if not — different from a
    // missing link which is treated as success / idempotent)
    const photo = await db.documentationPhoto.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!photo) {
      return NextResponse.json(
        { error: "Foto dokumentasi tidak ditemukan" },
        { status: 404 }
      );
    }

    // Idempotent: deleting a non-existent link is also "success"
    await db.photoOrderLink.deleteMany({
      where: { photoId: id, orderId },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/documentation/[id]/unlink error:", err);
    return NextResponse.json(
      { error: "Gagal memutus hubungan foto dari pesanan" },
      { status: 500 }
    );
  }
}
