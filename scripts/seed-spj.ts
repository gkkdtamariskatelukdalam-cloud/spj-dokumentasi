/**
 * Seed script: import Excel SPJ to database.
 * Usage: bun run scripts/seed-spj.ts
 */
import { db } from "../src/lib/db";
import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function cell(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s || s === "#N/A") return null;
  return s;
}

async function main() {
  const filePath = join(
    process.cwd(),
    "upload",
    "import aplikasi SPJ.xlsx"
  );
  console.log("Reading:", filePath);
  const buf = readFileSync(filePath);
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    raw: false,
  });

  console.log(`Total rows: ${rows.length}`);

  // data starts at row index 3 (row 4 in 1-indexed)
  const dataRows = rows.slice(3);

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
  let skipped = 0;
  for (const row of dataRows) {
    const noPesanan = cell(row[0]);
    const noBku = cell(row[1]);
    if (!noPesanan && !noBku) {
      skipped++;
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

  console.log(
    `Parsed ${groups.size} orders, ${Array.from(groups.values()).reduce(
      (a, g) => a + g.items.length,
      0
    )} items. Skipped ${skipped} empty rows.`
  );

  // Clean DB
  console.log("Clearing existing data...");
  await db.spjPhoto.deleteMany();
  await db.spjItem.deleteMany();
  await db.spjOrder.deleteMany();

  console.log("Inserting orders + items...");
  let i = 0;
  for (const g of groups.values()) {
    i++;
    if (i % 20 === 0) console.log(`  ${i}/${groups.size}`);
    await db.spjOrder.create({
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
        items: { create: g.items },
      },
    });
  }

  await db.importLog.create({
    data: {
      fileName: "import aplikasi SPJ.xlsx (seed)",
      totalRows: dataRows.length - skipped,
      totalOrders: groups.size,
      totalItems: Array.from(groups.values()).reduce(
        (a, g) => a + g.items.length,
        0
      ),
      status: "success",
      message: "Seeded via script",
    },
  });

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
