import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/export
 * Export all orders + items + photo status to Excel (.xlsx)
 *
 * Query params:
 *   status - "all" | "complete" | "incomplete" | "empty" (default: all)
 *
 * Returns .xlsx file download.
 */
export async function GET(req: NextRequest) {
  try {
    // Require authentication
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Login diperlukan" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status") || "all";

    // Fetch all orders with counts
    const orders = await db.spjOrder.findMany({
      include: {
        items: { orderBy: { createdAt: "asc" } },
        photos: { select: { id: true } },
        photoLinks: { select: { id: true } },
      },
      orderBy: [{ noPesanan: "asc" }],
    });

    // Numeric sort
    orders.sort((a, b) => {
      const na = parseInt(a.noPesanan, 10);
      const nb = parseInt(b.noPesanan, 10);
      if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
      return a.noPesanan.localeCompare(b.noPesanan);
    });

    // Calculate photo count per order (merged: SpjPhoto + DocumentationPhoto via links)
    const ordersWithStatus = orders.map((o) => {
      // Deduplicate by URL
      const urls = new Set<string>();
      for (const p of o.photos) urls.add(p.id);
      for (const l of o.photoLinks) urls.add(l.id);
      const photoCount = urls.size;
      return {
        ...o,
        photoCount,
        status:
          photoCount >= 2 ? "Lengkap" : photoCount > 0 ? "Kurang" : "Belum Ada",
      };
    });

    // Filter by status if needed
    let filtered = ordersWithStatus;
    if (statusFilter === "complete") {
      filtered = ordersWithStatus.filter((o) => o.photoCount >= 2);
    } else if (statusFilter === "incomplete") {
      filtered = ordersWithStatus.filter(
        (o) => o.photoCount > 0 && o.photoCount < 2
      );
    } else if (statusFilter === "empty") {
      filtered = ordersWithStatus.filter((o) => o.photoCount === 0);
    }

    // ===== Sheet 1: Ringkasan Orders =====
    const summaryData = filtered.map((o, idx) => ({
      "No": idx + 1,
      "No. Pesanan": o.noPesanan,
      "No. BKU": o.noBku,
      "Tanggal Pesanan": o.tanggalPesanan || "",
      "Tanggal BAST": o.tanggalBast || "",
      "Tanggal Bayar": o.tanggalBayar || "",
      "Uraian Kegiatan": o.uraianKegiatan || "",
      "Kategori Belanja": o.kategoriBelanja || "",
      "Nama Toko": o.namaToko || "",
      "Alamat Toko": o.alamatToko || "",
      "Direktur Toko": o.direkturToko || "",
      "No. HP": o.noHp || "",
      "Jumlah Item": o.items.length,
      "Total Nilai": o.items.reduce((sum, it) => {
        const n = Number(String(it.jumlah ?? "0").replace(/[^\d.-]/g, ""));
        return sum + (Number.isNaN(n) ? 0 : n);
      }, 0),
      "Jumlah Foto": o.photoCount,
      "Status Dokumentasi": o.status,
    }));

    const ws1 = XLSX.utils.json_to_sheet(summaryData);
    ws1["!cols"] = [
      { wch: 5 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 40 }, { wch: 20 }, { wch: 25 }, { wch: 40 },
      { wch: 20 }, { wch: 15 }, { wch: 8 }, { wch: 15 }, { wch: 8 }, { wch: 15 },
    ];

    // ===== Sheet 2: Detail Barang =====
    const itemsData: Array<Record<string, unknown>> = [];
    let itemNo = 1;
    for (const o of filtered) {
      for (const it of o.items) {
        itemsData.push({
          "No": itemNo++,
          "No. Pesanan": o.noPesanan,
          "No. BKU": o.noBku,
          "Nama Barang": it.namaBarang,
          "Volume": it.volume || "",
          "Satuan": it.satuan || "",
          "Harga Satuan": Number(String(it.hargaSatuan ?? "0").replace(/[^\d.-]/g, "")) || 0,
          "Jumlah": Number(String(it.jumlah ?? "0").replace(/[^\d.-]/g, "")) || 0,
          "Spesifikasi": it.spesifikasi || "",
          "Kategori": it.kategori || "",
        });
      }
    }

    const ws2 = XLSX.utils.json_to_sheet(itemsData);
    ws2["!cols"] = [
      { wch: 5 }, { wch: 10 }, { wch: 10 }, { wch: 35 }, { wch: 8 },
      { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 40 }, { wch: 20 },
    ];

    // ===== Sheet 3: Statistik =====
    const stats = {
      "Total Pesanan": filtered.length,
      "Total Item Barang": filtered.reduce((s, o) => s + o.items.length, 0),
      "Total Foto": filtered.reduce((s, o) => s + o.photoCount, 0),
      "Lengkap (≥2 foto)": filtered.filter((o) => o.photoCount >= 2).length,
      "Kurang (1 foto)": filtered.filter(
        (o) => o.photoCount > 0 && o.photoCount < 2
      ).length,
      "Belum Ada Foto": filtered.filter((o) => o.photoCount === 0).length,
      "Total Nilai (Rp)": filtered.reduce((s, o) => {
        return s + o.items.reduce((ss, it) => {
          const n = Number(String(it.jumlah ?? "0").replace(/[^\d.-]/g, ""));
          return ss + (Number.isNaN(n) ? 0 : n);
        }, 0);
      }, 0),
      "Tanggal Export": new Date().toLocaleString("id-ID"),
      "Filter": statusFilter === "all" ? "Semua" : statusFilter,
    };

    const ws3 = XLSX.utils.json_to_sheet([stats]);

    // ===== Create workbook =====
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, "Ringkasan Orders");
    XLSX.utils.book_append_sheet(wb, ws2, "Detail Barang");
    XLSX.utils.book_append_sheet(wb, ws3, "Statistik");

    // Generate buffer
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const fileName = `SPJ_Export_${new Date().toISOString().split("T")[0]}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("GET /api/export error:", err);
    return NextResponse.json(
      { error: "Gagal export: " + (err instanceof Error ? err.message : "unknown") },
      { status: 500 }
    );
  }
}
