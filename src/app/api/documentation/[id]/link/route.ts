import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/documentation/[id]/link
 *
 * List all orders linked to this photo.
 *
 * Returns: { orders: [{ id, noPesanan, noBku, uraianKegiatan }] }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    const links = await db.photoOrderLink.findMany({
      where: { photoId: id },
      select: {
        order: {
          select: {
            id: true,
            noPesanan: true,
            noBku: true,
            uraianKegiatan: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      orders: links.map((l) => ({
        id: l.order.id,
        noPesanan: l.order.noPesanan,
        noBku: l.order.noBku,
        uraianKegiatan: l.order.uraianKegiatan,
      })),
    });
  } catch (err) {
    console.error("GET /api/documentation/[id]/link error:", err);
    return NextResponse.json(
      { error: "Gagal memuat daftar pesanan terkait" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/documentation/[id]/link
 * Body: { orderIds: string[] }
 *
 * Link a photo to one or more orders. Duplicates are skipped silently
 * (relying on the @@unique([photoId, orderId]) constraint). Non-existent
 * orders or photos produce per-item errors.
 *
 * Returns: { success, linked, skipped, errors }
 *   linked   - count of newly created PhotoOrderLink rows
 *   skipped  - count of orderIds that were already linked (or invalid)
 *   errors   - list of per-order error messages
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    let body: { orderIds?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Body request tidak valid (harus JSON)" },
        { status: 400 }
      );
    }

    const orderIdsRaw = body.orderIds;
    if (!Array.isArray(orderIdsRaw) || orderIdsRaw.length === 0) {
      return NextResponse.json(
        { error: "orderIds harus berupa array string yang tidak kosong" },
        { status: 400 }
      );
    }
    const orderIds = Array.from(
      new Set(
        orderIdsRaw
          .map((x) => (typeof x === "string" ? x.trim() : ""))
          .filter((x) => x.length > 0)
      )
    );

    if (orderIds.length === 0) {
      return NextResponse.json(
        { error: "Tidak ada orderId yang valid" },
        { status: 400 }
      );
    }

    // Verify all referenced orders exist (skip those that don't)
    const existingOrders = await db.spjOrder.findMany({
      where: { id: { in: orderIds } },
      select: { id: true },
    });
    const existingOrderIds = new Set(existingOrders.map((o) => o.id));
    const missing = orderIds.filter((x) => !existingOrderIds.has(x));

    const errors: string[] = [];
    for (const m of missing) {
      errors.push(`Order ${m} tidak ditemukan`);
    }

    const validOrderIds = orderIds.filter((x) => existingOrderIds.has(x));

    let linked = 0;
    let skipped = 0;

    for (const orderId of validOrderIds) {
      try {
        await db.photoOrderLink.create({
          data: { photoId: id, orderId },
        });
        linked += 1;
      } catch (err) {
        // P2002 = unique constraint violation → already linked, skip
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          skipped += 1;
        } else {
          errors.push(
            `Gagal menghubungkan order ${orderId}: ${
              err instanceof Error ? err.message : "Unknown error"
            }`
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      linked,
      skipped,
      errors,
    });
  } catch (err) {
    console.error("POST /api/documentation/[id]/link error:", err);
    return NextResponse.json(
      { error: "Gagal menghubungkan foto dengan pesanan" },
      { status: 500 }
    );
  }
}
