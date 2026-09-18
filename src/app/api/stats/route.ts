import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/stats - dashboard summary statistics
 */
export async function GET() {
  try {
    const [totalOrders, totalItems, totalPhotos, orders] = await Promise.all([
      db.spjOrder.count(),
      db.spjItem.count(),
      db.spjPhoto.count(),
      db.spjOrder.findMany({
        select: {
          id: true,
          _count: { select: { photos: true } },
        },
      }),
    ]);

    let completeOrders = 0;
    let incompleteOrders = 0;
    let emptyOrders = 0;
    for (const o of orders) {
      if (o._count.photos >= 2) completeOrders++;
      else if (o._count.photos > 0) incompleteOrders++;
      else emptyOrders++;
    }

    return NextResponse.json({
      totalOrders,
      totalItems,
      totalPhotos,
      completeOrders,
      incompleteOrders,
      emptyOrders,
      progress:
        totalOrders > 0
          ? Math.round((completeOrders / totalOrders) * 100)
          : 0,
    });
  } catch (err) {
    console.error("GET /api/stats error:", err);
    return NextResponse.json(
      { error: "Gagal memuat statistik" },
      { status: 500 }
    );
  }
}
