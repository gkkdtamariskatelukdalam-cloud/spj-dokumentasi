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

    // Reset existing data for the target year.
    // If yearId is provided (multi-year mode): only delete data for that year.
    // If yearId is null (legacy mode): delete all data (preserves prior behavior).
    if (yearId) {
      await db.photoOrderLink.deleteMany({
        where: { order: { yearId } },
      });
      await db.spjPhoto.deleteMany({
        where: { order: { yearId } },
      });
      await db.spjItem.deleteMany({
        where: { order: { yearId } },
      });
      await db.spjOrder.deleteMany({ where: { yearId } });
    } else {
      await db.spjPhoto.deleteMany();
      await db.spjItem.deleteMany();
      await db.spjOrder.deleteMany();
    }

    let totalOrders = 0;
    let totalItems = 0;

    // Use a transaction for speed
    await db.$transaction(
      Array.from(groups.values()).map((g) =>
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

    totalOrders = groups.size;
    totalItems = Array.from(groups.values()).reduce(
      (acc, g) => acc + g.items.length,
      0
    );

    await db.importLog.create({
      data: {
        fileName: file.name,
        totalRows: dataRows.length - skippedRows,
        totalOrders,
        totalItems,
        status: "success",
        message: `Imported ${totalOrders} orders, ${totalItems} items. Skipped ${skippedRows} empty rows.`,
        yearId,
      },
    });

    return NextResponse.json({
      success: true,
      totalOrders,
      totalItems,
      skippedRows,
      message: `Berhasil import ${totalOrders} No Pesanan dengan ${totalItems} item barang`,
    });
  } catch (err) {
    console.error("Import error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
