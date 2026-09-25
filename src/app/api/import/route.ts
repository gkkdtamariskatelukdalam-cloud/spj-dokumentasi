import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cookies } from "next/headers";

export const ACTIVE_YEAR_COOKIE = "spj_active_year";

/**
 * Parse Excel SPJ file and import all rows to DB.
 * Groups rows by No Pesanan (column A) -> 1 SpjOrder, many SpjItem.
 *
 * Excel columns mapping (row 2 = headers, row 4+ = data):
 *  A -> No. Surat Pesan (No Pesanan)
 *  B -> No BKU
 *  C -> Kode Program
 *  D -> Kode Rekening
 *  F -> Tanggal Pesanan
 *  G -> Tanggal BAST
 *  I -> Tanggal Bayar
 *  J -> Uraian Kegiatan
 *  K -> Nama Barang
 *  L -> Volume
 *  M -> Satuan
 *  N -> Harga Satuan
 *  O -> Jumlah
 *  P -> Kategori Belanja
 *  Q -> Spesifikasi
 *  T -> Nama Toko 1
 *  V -> Direktur Toko 1
 *  W -> Alamat Toko 1
 *  AH -> NO HP
 */

// We must load xlsx dynamically because it uses Node fs
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cell(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s || s === "#N/A") return null;
  return s;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "File Excel wajib diunggah" },
        { status: 400 }
      );
    }

    // Determine target year: explicit FormData field, or active-year cookie
    let yearId: string | null =
      (formData.get("yearId") as string)?.trim() || null;
    if (yearId === "all") yearId = null;
    if (!yearId) {
      try {
        const cookieStore = await cookies();
        const cookieVal = cookieStore.get(ACTIVE_YEAR_COOKIE)?.value;
        if (cookieVal && cookieVal !== "all") {
          // Validate cookie value is an existing year
          const exists = await db.spjYear.findUnique({
            where: { id: cookieVal },
            select: { id: true },
          });
          if (exists) yearId = cookieVal;
        }
      } catch {
        // ignore cookie read errors
      }
    }

    const buf = await file.arrayBuffer();
    // dynamic import xlsx (it's a CJS lib)
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    // header: 1 -> array of arrays; defval keeps empty cells as empty string
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
      raw: false,
    });

    if (rows.length < 4) {
      return NextResponse.json(
        { error: "Excel tidak memiliki data (minimal 4 baris)" },
        { status: 400 }
      );
    }

    // Data starts at row index 3 (row 4 in 1-indexed)
    const dataRows = rows.slice(3);

    // Group rows by No Pesanan
    type OrderGroup = {
      noPesanan: string;
      noBku: string;
      kodeProgram: string | null;
      kodeRekening: string | null;
      tanggalPesanan: string | null;
      tanggalBast: string | null;
      tanggalBayar: string | null;
      uraianKegiatan: string | null;
      kategoriBelanja: string | null;
      namaToko: string | null;
      alamatToko: string | null;
      direkturToko: string | null;
      noHp: string | null;
      items: Array<{
        namaBarang: string;
        volume: string | null;
        satuan: string | null;
        hargaSatuan: string | null;
        jumlah: string | null;
        spesifikasi: string | null;
        kategori: string | null;
        uraian: string | null;
      }>;
    };

    const groups = new Map<string, OrderGroup>();
    let skippedRows = 0;

    for (const row of dataRows) {
      const noPesanan = cell(row[0]);
      const noBku = cell(row[1]);
      if (!noPesanan && !noBku) {
        skippedRows++;
        continue;
      }
      const key = noPesanan ?? `__nobku_${noBku}`;
      if (!groups.has(key)) {
        groups.set(key, {
          noPesanan: noPesanan ?? "",
          noBku: noBku ?? "",
          kodeProgram: cell(row[2]),
          kodeRekening: cell(row[3]),
          tanggalPesanan: cell(row[5]),
          tanggalBast: cell(row[6]),
          tanggalBayar: cell(row[8]),
          uraianKegiatan: cell(row[9]),
          kategoriBelanja: cell(row[15]),
          namaToko: cell(row[19]),
          alamatToko: cell(row[22]),
          direkturToko: cell(row[21]),
          noHp: cell(row[33]),
          items: [],
        });
      }
      const g = groups.get(key)!;
      const namaBarang = cell(row[10]);
      // skip empty item rows but keep the order
      if (namaBarang) {
        g.items.push({
          namaBarang,
          volume: cell(row[11]),
          satuan: cell(row[12]),
          hargaSatuan: cell(row[13]),
          jumlah: cell(row[14]),
          spesifikasi: cell(row[16]),
          kategori: cell(row[15]),
          uraian: cell(row[9]),
        });
      }
    }

    // ===== DEDUPLICATION IMPORT =====
    // Cek apakah data (No Pesanan + BKU) sudah ada di database untuk tahun aktif.
    // Jika sudah ada → skip (tidak import duplikat).
    // Jika belum ada → import data baru.
    // Data lama TIDAK dihapus — hanya skip duplikat.

    // Ambil semua No Pesanan + BKU yang sudah ada di database untuk tahun ini
    const existingOrders = await db.spjOrder.findMany({
      where: yearId ? { yearId } : {},
      select: { id: true, noPesanan: true, noBku: true },
    });

    // Buat set of "noPesanan|noBku" untuk cek duplikat cepat
    const existingKeys = new Set(
      existingOrders.map((o) => `${o.noPesanan}|${o.noBku}`)
    );

    // Ambil semua nama barang yang sudah ada untuk orders yang existing
    // (untuk cek duplikat item level)
    const existingOrderIds = existingOrders.map((o) => o.id);
    const existingItems = await db.spjItem.findMany({
      where: { orderId: { in: existingOrderIds } },
      select: { orderId: true, namaBarang: true },
    });

    // Map: orderId → Set of namaBarang (untuk cek duplikat item)
    const existingItemsMap = new Map<string, Set<string>>();
    for (const it of existingItems) {
      if (!existingItemsMap.has(it.orderId)) {
        existingItemsMap.set(it.orderId, new Set());
      }
      existingItemsMap.get(it.orderId)!.add(it.namaBarang.toLowerCase());
    }

    // Map noPesanan|noBku → orderId (untuk lookup saat insert item)
    const existingOrderMap = new Map<string, string>();
    for (const o of existingOrders) {
      existingOrderMap.set(`${o.noPesanan}|${o.noBku}`, o.id);
    }

    let totalOrders = 0;
    let totalItems = 0;
    let skippedDuplicates = 0;
    let skippedItemDuplicates = 0;
    const newOrders: OrderGroup[] = [];

    // Pisahkan: orders baru vs orders yang sudah ada
    for (const g of groups.values()) {
      const key = `${g.noPesanan}|${g.noBku}`;
      if (existingKeys.has(key)) {
        // Order sudah ada — cek item-level: hanya insert item yang belum ada
        const existingOrderId = existingOrderMap.get(key)!;
        const existingItemNames = existingItemsMap.get(existingOrderId) || new Set<string>();

        const newItems: typeof g.items = [];
        for (const item of g.items) {
          if (existingItemNames.has(item.namaBarang.toLowerCase())) {
            skippedItemDuplicates++; // item sudah ada, skip
          } else {
            newItems.push(item);
            existingItemNames.add(item.namaBarang.toLowerCase()); // prevent in-batch dup
          }
        }

        if (newItems.length > 0) {
          // Insert hanya item baru ke order yang sudah ada
          await db.spjItem.createMany({
            data: newItems.map((it) => ({
              ...it,
              orderId: existingOrderId,
            })),
          });
          totalItems += newItems.length;
        }
        skippedDuplicates++; // order sudah ada (tapi mungkin ada item baru)
      } else {
        // Order baru — insert order + semua items
        newOrders.push(g);
        existingKeys.add(key); // prevent in-batch dup
      }
    }

    // Insert orders baru dalam transaction
    if (newOrders.length > 0) {
      await db.$transaction(
        newOrders.map((g) =>
          db.spjOrder.create({
            data: {
              noPesanan: g.noPesanan,
              noBku: g.noBku,
              kodeProgram: g.kodeProgram,
              kodeRekening: g.kodeRekening,
              tanggalPesanan: g.tanggalPesanan,
              tanggalBast: g.tanggalBast,
              tanggalBayar: g.tanggalBayar,
              uraianKegiatan: g.uraianKegiatan,
              kategoriBelanja: g.kategoriBelanja,
              namaToko: g.namaToko,
              alamatToko: g.alamatToko,
              direkturToko: g.direkturToko,
              noHp: g.noHp,
              yearId,
              items: {
                create: g.items,
              },
            },
          })
        )
      );
      totalOrders = newOrders.length;
      totalItems += newOrders.reduce((acc, g) => acc + g.items.length, 0);
    }

    await db.importLog.create({
      data: {
        fileName: file.name,
        totalRows: dataRows.length - skippedRows,
        totalOrders,
        totalItems,
        status: "success",
        message: `Imported ${totalOrders} new orders, ${totalItems} items. Skipped ${skippedDuplicates} existing orders, ${skippedItemDuplicates} duplicate items.`,
        yearId,
      },
    });

    return NextResponse.json({
      success: true,
      totalOrders,
      totalItems,
      skippedRows,
      skippedDuplicates,
      skippedItemDuplicates,
      message: `Import selesai: ${totalOrders} order baru, ${totalItems} item baru. ${skippedDuplicates} order sudah ada (di-skip). ${skippedItemDuplicates} item duplikat di-skip.`,
    });
  } catch (err) {
    console.error("Import error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
