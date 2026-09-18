import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/orders
 * Query params:
 *   q       - search keyword (No Pesanan, BKU, Nama Barang, Uraian, Toko)
 *   status  - "complete" | "incomplete" | "empty" | "all"
 *   page    - default 1
 *   pageSize - default 12
 *
 * IMPORTANT: Status filter is applied BEFORE pagination so that
 * the total count and page contents are correct. We fetch all
 * matching orders with just their photo/item counts (lightweight),
 * filter in memory, then paginate. With ~208 orders this is fast.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() || "";
    const status = searchParams.get("status") || "all";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") || "12", 10))
    );

    const where = q
      ? {
          OR: [
            { noPesanan: { contains: q } },
            { noBku: { contains: q } },
            { uraianKegiatan: { contains: q } },
            { namaToko: { contains: q } },
            { kategoriBelanja: { contains: q } },
            {
              items: {
                some: { namaBarang: { contains: q } },
              },
            },
          ],
        }
      : {};

    // Fetch ALL matching orders with just counts (no heavy item/photo data)
    const allOrders = await db.spjOrder.findMany({
      where,
      select: {
        id: true,
        noPesanan: true,
        noBku: true,
        uraianKegiatan: true,
        kategoriBelanja: true,
        namaToko: true,
        tanggalPesanan: true,
        tanggalBayar: true,
        _count: { select: { photos: true, items: true } },
      },
    });

    // Compute status for each order and filter BEFORE pagination
    const withStatus = allOrders.map((o) => ({
      ...o,
      photoCount: o._count.photos,
      itemCount: o._count.items,
      status:
        o._count.photos >= 2
          ? ("complete" as const)
          : o._count.photos > 0
          ? ("incomplete" as const)
          : ("empty" as const),
    }));

    let filtered = withStatus;
    if (status === "complete") {
      filtered = withStatus.filter((o) => o.status === "complete");
    } else if (status === "incomplete") {
      filtered = withStatus.filter((o) => o.status === "incomplete");
    } else if (status === "empty") {
      filtered = withStatus.filter((o) => o.status === "empty");
    }

    // Sort numerically by noPesanan (so 11 comes before 100, not after 109)
    filtered.sort((a, b) => {
      const na = parseInt(a.noPesanan, 10);
      const nb = parseInt(b.noPesanan, 10);
      if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
      if (a.noPesanan !== b.noPesanan)
        return a.noPesanan.localeCompare(b.noPesanan);
      return a.noBku.localeCompare(b.noBku);
    });

    // Paginate AFTER filtering — correct total & totalPages
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

    return NextResponse.json({
      orders: paged.map((o) => ({
        id: o.id,
        noPesanan: o.noPesanan,
        noBku: o.noBku,
        uraianKegiatan: o.uraianKegiatan,
        kategoriBelanja: o.kategoriBelanja,
        namaToko: o.namaToko,
        tanggalPesanan: o.tanggalPesanan,
        tanggalBayar: o.tanggalBayar,
        photoCount: o.photoCount,
        itemCount: o.itemCount,
        status: o.status,
      })),
      total,
      page,
      pageSize,
      totalPages,
    });
  } catch (err) {
    console.error("GET /api/orders error:", err);
    return NextResponse.json(
      { error: "Gagal memuat data orders" },
      { status: 500 }
    );
  }
}
