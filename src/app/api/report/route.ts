import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import sharp from "sharp";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/report
 * Query params:
 *   mode          - "all" | "order" | "bku"   (default: all)
 *   orderId       - single order id (for mode=order)
 *   bku           - BKU code substring (for mode=bku)
 *   noPesanan     - No Pesanan substring (alternative to orderId)
 *   includePhotos - "1" | "0"  (default: 1)
 *   includeItems  - "1" | "0"  (default: 1)
 *   format        - "full" | "lampiran"  (default: full)
 *                   - "full"     = laporan lengkap (data + tabel + foto)
 *                   - "lampiran" = Lampiran Gambar BAST (photo-only, match reference PDF)
 *
 * Returns a complete HTML document (print-ready, A4) that auto-triggers print().
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = (searchParams.get("mode") || "all") as
      | "all"
      | "order"
      | "bku";
    const orderId = searchParams.get("orderId") || "";
    const bku = (searchParams.get("bku") || "").trim();
    const noPesanan = (searchParams.get("noPesanan") || "").trim();
    const includePhotos = searchParams.get("includePhotos") !== "0";
    const includeItems = searchParams.get("includeItems") !== "0";
    const format = (searchParams.get("format") || "full") as
      | "full"
      | "lampiran";
    // Date range filter (for mode=all)
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";
    // Year filter (optional). "all" or empty => no filter
    const yearIdRaw = searchParams.get("yearId")?.trim() || "";
    const yearId = yearIdRaw && yearIdRaw !== "all" ? yearIdRaw : null;

    // Build where clause
    const where: Record<string, unknown> = {};
    if (mode === "order" && orderId) {
      where.id = orderId;
    } else if (mode === "order" && noPesanan) {
      where.noPesanan = noPesanan;
    } else if (mode === "bku" && bku) {
      where.noBku = { contains: bku };
    }
    if (yearId) {
      where.yearId = yearId;
    }

    // Date range filter: filter by tanggalPesanan (format DD/MM/YYYY in Excel)
    // We filter in-memory after fetch since tanggalPesanan is stored as String (not Date)
    // This is handled after fetch below

    // Fetch orders with items, legacy photos (SpjPhoto), and documentation photos (via PhotoOrderLink)
    const orders = await db.spjOrder.findMany({
      where,
      include: {
        items: { orderBy: { createdAt: "asc" } },
        photos: { orderBy: { createdAt: "asc" } },
        photoLinks: {
          include: { photo: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ noPesanan: "asc" }],
    });

    // ===== Date range filter (in-memory, since tanggalPesanan is String "DD/MM/YYYY") =====
    // Parse "DD/MM/YYYY" to Date object for comparison
    function parseDateStr(s: string | null): Date | null {
      if (!s) return null;
      const parts = s.split("/");
      if (parts.length < 3) return null;
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      let y = parseInt(parts[2], 10);
      if (y < 100) y += 2000;
      return new Date(y, m, d);
    }

    let filteredOrders = orders;
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate + "T00:00:00") : null;
      const end = endDate ? new Date(endDate + "T23:59:59") : null;

      filteredOrders = orders.filter((o) => {
        const orderDate = parseDateStr(o.tanggalPesanan);
        if (!orderDate) return false; // skip if date can't be parsed
        if (start && orderDate < start) return false;
        if (end && orderDate > end) return false;
        return true;
      });
    }

    if (filteredOrders.length === 0) {
      return NextResponse.json(
        { error: "Tidak ada data yang cocok dengan filter" },
        { status: 404 }
      );
    }

    // Numeric sort
    filteredOrders.sort((a, b) => {
      const na = parseInt(a.noPesanan, 10);
      const nb = parseInt(b.noPesanan, 10);
      if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
      return a.noPesanan.localeCompare(b.noPesanan);
    });

    // Compute summary
    const totalItems = filteredOrders.reduce(
      (acc, o) => acc + o.items.length,
      0
    );
    const totalPhotos = filteredOrders.reduce(
      (acc, o) => acc + o.photos.length,
      0
    );
    const grandTotal = filteredOrders.reduce((acc, o) => {
      return (
        acc +
        o.items.reduce((s, it) => {
          const n = Number(String(it.jumlah ?? "0").replace(/[^\d.-]/g, ""));
          return s + (Number.isNaN(n) ? 0 : n);
        }, 0)
      );
    }, 0);

    const generatedAt = new Date().toLocaleString("id-ID", {
      dateStyle: "long",
      timeStyle: "short",
    });

    // ===== LAMPIRAN FORMAT (match reference PDF: Gambar BAST PC all in one.pdf) =====
    if (format === "lampiran") {
      // Construct base URL for footer (absolute URL like reference PDF)
      const host = req.headers.get("host") || "localhost:3000";
      const protocol = req.headers.get("x-forwarded-proto") || "http";
      const baseUrl = `${protocol}://${host}`;

      // Read actual image dimensions for orientation detection
      // Merge photos from TWO sources:
      //   1. Legacy SpjPhoto (o.photos) — old upload system
      //   2. DocumentationPhoto via PhotoOrderLink (o.photoLinks) — new many-to-many system
      // Deduplicate by filePath to avoid showing the same photo twice
      // (migration may have created both SpjPhoto and DocumentationPhoto for same file)
      const ordersWithMeta = await Promise.all(
        filteredOrders.map(async (o) => {
          // Collect all unique photo URLs from both sources
          const seenUrls = new Set<string>();
          const allPhotos: Array<{
            id: string;
            url: string;
            fileName: string;
            filePath: string;
            deviceType: string;
            source: string;
            orientation: ImageOrientation;
          }> = [];

          // Source 1: Legacy SpjPhoto
          for (const p of o.photos) {
            if (seenUrls.has(p.url)) continue;
            seenUrls.add(p.url);
            const orientation = await getImageOrientation(p.filePath);
            allPhotos.push({
              id: p.id,
              url: p.url,
              fileName: p.fileName,
              filePath: p.filePath,
              deviceType: p.deviceType,
              source: p.source,
              orientation,
            });
          }

          // Source 2: DocumentationPhoto via PhotoOrderLink (many-to-many)
          for (const link of o.photoLinks) {
            const p = link.photo;
            if (seenUrls.has(p.url)) continue;
            seenUrls.add(p.url);
            const orientation = await getImageOrientation(p.filePath);
            allPhotos.push({
              id: p.id,
              url: p.url,
              fileName: p.fileName,
              filePath: p.filePath,
              deviceType: p.deviceType,
              source: p.source,
              orientation,
            });
          }

          return {
            ...o,
            photos: allPhotos, // merged + deduplicated photos
          };
        })
      );

      const lampiranHtml = renderLampiran({
        mode,
        bku,
        orders: ordersWithMeta,
        summary: {
          totalOrders: filteredOrders.length,
          totalItems,
          totalPhotos,
          grandTotal,
        },
        generatedAt,
        baseUrl,
      });

      return new NextResponse(lampiranHtml, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    // ===== FULL FORMAT (default, existing report) =====
    const title =
      mode === "order"
        ? `Laporan SPJ — No. Pesanan #${orders[0].noPesanan}`
        : mode === "bku"
        ? `Laporan SPJ — BKU: ${bku}`
        : "Laporan SPJ — Semua No. Pesanan";

    const reportHtml = renderReport({
      title,
      mode,
      orders,
      includePhotos,
      includeItems,
      summary: {
        totalOrders: filteredOrders.length,
        totalItems,
        totalPhotos,
        grandTotal,
      },
      generatedAt,
    });

    return new NextResponse(reportHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err) {
    console.error("GET /api/report error:", err);
    return NextResponse.json(
      { error: "Gagal membuat laporan" },
      { status: 500 }
    );
  }
}

interface ReportContext {
  title: string;
  mode: "all" | "order" | "bku";
  orders: Array<{
    id: string;
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
      id: string;
      namaBarang: string;
      volume: string | null;
      satuan: string | null;
      hargaSatuan: string | null;
      jumlah: string | null;
      spesifikasi: string | null;
    }>;
    photos: Array<{
      id: string;
      url: string;
      fileName: string;
      deviceType: string;
      source: string;
    }>;
  }>;
  includePhotos: boolean;
  includeItems: boolean;
  summary: {
    totalOrders: number;
    totalItems: number;
    totalPhotos: number;
    grandTotal: number;
  };
  generatedAt: string;
}

function formatRupiah(val: string | null | undefined): string {
  if (!val) return "-";
  const n = Number(String(val).replace(/[^\d.-]/g, ""));
  if (Number.isNaN(n)) return val;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderReport(ctx: ReportContext): string {
  const {
    title,
    mode,
    orders,
    includePhotos,
    includeItems,
    summary,
    generatedAt,
  } = ctx;

  const orderSections = orders
    .map((o, idx) => renderOrderSection(o, idx + 1, includePhotos, includeItems))
    .join("\n");

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<style>
  /* ============ PRINT STYLES ============ */
  @page {
    size: A4;
    margin: 1.2cm 1.4cm;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 11px;
    color: #1a1a1a;
    background: #fff;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1, h2, h3, h4 { margin: 0 0 6px 0; color: #111; }
  p { margin: 0 0 4px 0; }

  /* Cover page */
  .cover {
    page-break-after: always;
    min-height: 26cm;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    padding: 2cm 0;
  }
  .cover .logo {
    width: 80px;
    height: 80px;
    background: #111;
    color: #fff;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    font-weight: 700;
    margin: 0 auto 20px;
  }
  .cover h1 {
    font-size: 24px;
    margin-bottom: 8px;
  }
  .cover .subtitle {
    font-size: 14px;
    color: #555;
    margin-bottom: 30px;
  }
  .cover .meta {
    font-size: 12px;
    color: #444;
    line-height: 1.8;
    margin-top: 30px;
  }
  .cover .meta strong { color: #111; }

  /* Summary box on cover */
  .summary-box {
    margin-top: 40px;
    border: 1px solid #ccc;
    border-radius: 6px;
    padding: 16px 24px;
    background: #f9f9f9;
    display: inline-block;
    text-align: left;
  }
  .summary-box table { border-collapse: collapse; }
  .summary-box td { padding: 3px 12px; font-size: 12px; }
  .summary-box td:first-child { color: #666; }
  .summary-box td:last-child { font-weight: 600; text-align: right; }

  /* Order section: each starts on new page */
  .order-section {
    page-break-before: always;
  }
  .order-section:first-of-type {
    page-break-before: avoid;
  }

  .order-header {
    border-bottom: 2px solid #111;
    padding-bottom: 8px;
    margin-bottom: 12px;
  }
  .order-header .order-num {
    font-size: 16px;
    font-weight: 700;
    color: #111;
  }
  .order-header .order-bku {
    font-size: 12px;
    color: #555;
    margin-left: 12px;
  }
  .order-header .order-status {
    float: right;
    font-size: 11px;
    padding: 2px 10px;
    border-radius: 10px;
    font-weight: 600;
  }
  .status-complete { background: #d1fae5; color: #065f46; }
  .status-incomplete { background: #fef3c7; color: #92400e; }
  .status-empty { background: #fee2e2; color: #991b1b; }
  .order-header .uraian {
    font-size: 12px;
    color: #333;
    margin-top: 4px;
    line-height: 1.4;
  }

  /* Meta info grid */
  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 18px;
    margin: 10px 0;
  }
  .meta-grid .item {
    font-size: 10.5px;
    border-bottom: 1px dotted #ddd;
    padding: 3px 0;
  }
  .meta-grid .item .label {
    color: #666;
    display: inline-block;
    width: 110px;
  }
  .meta-grid .item .value {
    font-weight: 500;
    color: #111;
  }

  /* Items table */
  .items-block { margin-top: 12px; }
  .items-block h3 {
    font-size: 12px;
    margin-bottom: 6px;
    padding-bottom: 3px;
    border-bottom: 1px solid #ddd;
  }
  table.items {
    width: 100%;
    border-collapse: collapse;
    font-size: 10.5px;
  }
  table.items thead th {
    background: #f0f0f0;
    border: 1px solid #ccc;
    padding: 5px 6px;
    text-align: left;
    font-weight: 600;
    font-size: 10px;
  }
  table.items tbody td {
    border: 1px solid #ddd;
    padding: 5px 6px;
    vertical-align: top;
  }
  table.items tbody tr:nth-child(even) td {
    background: #fafafa;
  }
  table.items td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  table.items td.idx { text-align: center; color: #666; width: 24px; }
  table.items tfoot td {
    border: 1px solid #ccc;
    padding: 5px 6px;
    font-weight: 700;
    background: #f0f0f0;
    text-align: right;
  }

  /* Photos block */
  .photos-block { margin-top: 14px; }
  .photos-block h3 {
    font-size: 12px;
    margin-bottom: 6px;
    padding-bottom: 3px;
    border-bottom: 1px solid #ddd;
  }
  .photos-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .photo-card {
    border: 1px solid #ccc;
    border-radius: 4px;
    overflow: hidden;
    page-break-inside: avoid;
  }
  .photo-card img {
    width: 100%;
    height: 110px;
    object-fit: cover;
    display: block;
    background: #f0f0f0;
  }
  .photo-card .caption {
    padding: 3px 6px;
    font-size: 8.5px;
    color: #555;
    background: #fafafa;
    border-top: 1px solid #eee;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .no-photos {
    border: 1px dashed #ccc;
    padding: 16px;
    text-align: center;
    color: #999;
    font-size: 11px;
    font-style: italic;
  }

  /* Footer of each page */
  .page-footer {
    margin-top: 18px;
    padding-top: 6px;
    border-top: 1px solid #eee;
    font-size: 9px;
    color: #888;
    display: flex;
    justify-content: space-between;
  }

  /* Signature block */
  .signature-block {
    margin-top: 36px;
    display: flex;
    justify-content: space-between;
    page-break-inside: avoid;
  }
  .signature-block .sig {
    text-align: center;
    width: 45%;
  }
  .signature-block .sig .role {
    font-size: 11px;
    margin-bottom: 60px;
  }
  .signature-block .sig .name {
    font-size: 11px;
    font-weight: 600;
    border-top: 1px solid #333;
    padding-top: 4px;
  }

  /* Table of contents */
  .toc {
    page-break-after: always;
  }
  .toc h2 {
    font-size: 16px;
    margin-bottom: 10px;
    padding-bottom: 4px;
    border-bottom: 2px solid #111;
  }
  .toc table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }
  .toc td {
    padding: 4px 6px;
    border-bottom: 1px solid #eee;
  }
  .toc td.num { width: 40px; font-weight: 600; }
  .toc td.bku { width: 80px; color: #555; }
  .toc td.foto { width: 60px; text-align: right; color: #555; }
  .toc td.status { width: 90px; text-align: center; }

  /* Print-only hide */
  @media screen {
    body {
      background: #e5e5e5;
      padding: 20px;
    }
    .print-area {
      max-width: 800px;
      margin: 0 auto;
      background: #fff;
      padding: 30px 40px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .print-hint {
      text-align: center;
      padding: 12px;
      background: #fff8e1;
      border: 1px solid #ffcc02;
      border-radius: 4px;
      margin-bottom: 16px;
      font-size: 12px;
    }
  }
  @media print {
    .print-hint { display: none !important; }
    .print-area { box-shadow: none; padding: 0; }
  }
</style>
</head>
<body>
<div class="print-area">
  <div class="print-hint" style="display:none" id="printHint">
    Gunakan <strong>Ctrl/Cmd + P</strong> untuk mencetak, atau pilih <strong>"Save as PDF"</strong> sebagai destination.
  </div>

  <!-- COVER PAGE -->
  <div class="cover">
    <div class="logo">SPJ</div>
    <h1>${esc(title)}</h1>
    <div class="subtitle">SMAN 1 Telukdalam &mdash; Tahun 2024</div>
    <div class="summary-box">
      <table>
        <tr><td>Total No. Pesanan</td><td>: ${summary.totalOrders}</td></tr>
        <tr><td>Total Item Barang</td><td>: ${summary.totalItems}</td></tr>
        <tr><td>Total Foto Dokumentasi</td><td>: ${summary.totalPhotos}</td></tr>
        <tr><td>Nilai Total</td><td>: ${formatRupiah(String(summary.grandTotal))}</td></tr>
      </table>
    </div>
    <div class="meta">
      <p>Dibuat pada: <strong>${esc(generatedAt)}</strong></p>
      <p>Mode: <strong>${mode === "all" ? "Semua" : mode === "order" ? "Per No. Pesanan" : "Per BKU"}</strong></p>
    </div>
  </div>

  ${
    filteredOrders.length > 1
      ? renderTOC(orders)
      : ""
  }

  ${orderSections}

  <script>
    // Auto-trigger print after images load (with timeout fallback)
    (function() {
      var hint = document.getElementById('printHint');
      if (hint) hint.style.display = 'block';
      var imgs = Array.from(document.images);
      var loaded = 0;
      var total = imgs.length;
      function tryPrint() {
        loaded++;
        if (loaded >= total || loaded > 30) {
          setTimeout(function() {
            try { window.print(); } catch(e) {}
          }, 400);
        }
      }
      if (total === 0) {
        setTimeout(function() { try { window.print(); } catch(e) {} }, 400);
      } else {
        imgs.forEach(function(img) {
          if (img.complete) { tryPrint(); }
          else {
            img.addEventListener('load', tryPrint);
            img.addEventListener('error', tryPrint);
          }
        });
        // Safety fallback: print after 4s regardless
        setTimeout(function() { try { window.print(); } catch(e) {} }, 4000);
      }
    })();
  </script>
</div>
</body>
</html>`;
}

function renderTOC(orders: ReportContext["orders"]): string {
  const rows = orders
    .map((o) => {
      const status =
        o.photos.length >= 2
          ? '<span class="status-complete">Lengkap</span>'
          : o.photos.length > 0
          ? '<span class="status-incomplete">Kurang</span>'
          : '<span class="status-empty">Belum</span>';
      return `<tr>
        <td class="num">#${esc(o.noPesanan)}</td>
        <td class="bku">${esc(o.noBku)}</td>
        <td>${esc((o.uraianKegiatan || o.kategoriBelanja || "").substring(0, 80))}</td>
        <td class="foto">${o.photos.length} foto</td>
        <td class="status">${status}</td>
      </tr>`;
    })
    .join("");

  return `<div class="toc">
    <h2>Daftar Isi</h2>
    <table>
      <thead>
        <tr style="border-bottom:2px solid #111;">
          <th style="text-align:left;padding:4px 6px;">No. Pesanan</th>
          <th style="text-align:left;padding:4px 6px;">BKU</th>
          <th style="text-align:left;padding:4px 6px;">Uraian / Kategori</th>
          <th style="text-align:right;padding:4px 6px;">Foto</th>
          <th style="text-align:center;padding:4px 6px;">Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function renderOrderSection(
  o: ReportContext["orders"][number],
  idx: number,
  includePhotos: boolean,
  includeItems: boolean
): string {
  const status =
    o.photos.length >= 2
      ? { label: "Lengkap (≥2 foto)", cls: "status-complete" }
      : o.photos.length > 0
      ? { label: `Kurang (${o.photos.length} foto)`, cls: "status-incomplete" }
      : { label: "Belum ada foto", cls: "status-empty" };

  const orderTotal = o.items.reduce((acc, it) => {
    const n = Number(String(it.jumlah ?? "0").replace(/[^\d.-]/g, ""));
    return acc + (Number.isNaN(n) ? 0 : n);
  }, 0);

  const itemsTable = includeItems
    ? `<div class="items-block">
        <h3>Daftar Barang (${o.items.length} item)</h3>
        ${
          o.items.length === 0
            ? '<p style="font-size:11px;color:#999;font-style:italic;">Tidak ada item barang.</p>'
            : `<table class="items">
            <thead>
              <tr>
                <th style="width:24px;">No</th>
                <th>Nama Barang</th>
                <th style="text-align:right;width:50px;">Vol</th>
                <th style="width:60px;">Satuan</th>
                <th style="text-align:right;width:90px;">Harga Satuan</th>
                <th style="text-align:right;width:100px;">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              ${o.items
                .map(
                  (it, i) => `<tr>
                <td class="idx">${i + 1}</td>
                <td>
                  <div>${esc(it.namaBarang)}</div>
                  ${
                    it.spesifikasi
                      ? `<div style="font-size:9px;color:#888;margin-top:2px;">${esc(it.spesifikasi.substring(0, 120))}${it.spesifikasi.length > 120 ? "..." : ""}</div>`
                      : ""
                  }
                </td>
                <td class="num">${esc(it.volume ?? "-")}</td>
                <td>${esc(it.satuan ?? "-")}</td>
                <td class="num">${formatRupiah(it.hargaSatuan)}</td>
                <td class="num">${formatRupiah(it.jumlah)}</td>
              </tr>`
                )
                .join("")}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="5" style="text-align:right;">Total Pesanan</td>
                <td>${formatRupiah(String(orderTotal))}</td>
              </tr>
            </tfoot>
          </table>`
        }
      </div>`
    : "";

  const photosBlock = includePhotos
    ? `<div class="photos-block">
        <h3>Foto Dokumentasi (${o.photos.length})</h3>
        ${
          o.photos.length === 0
            ? '<div class="no-photos">Belum ada foto dokumentasi untuk No. Pesanan ini.</div>'
            : `<div class="photos-grid">
            ${o.photos
              .map(
                (p) => `<div class="photo-card">
                <img src="${esc(p.url)}" alt="${esc(p.fileName)}" />
                <div class="caption">${esc(p.fileName)} &middot; ${p.deviceType === "camera" ? "Kamera" : "Upload"}</div>
              </div>`
              )
              .join("")}
          </div>`
        }
      </div>`
    : "";

  return `<div class="order-section">
    <div class="order-header">
      <span class="order-num">#${esc(o.noPesanan)}</span>
      <span class="order-bku">BKU: ${esc(o.noBku)}</span>
      <span class="order-status ${status.cls}">${status.label}</span>
      <div class="uraian">${esc(o.uraianKegiatan || o.kategoriBelanja || "(tanpa uraian)")}</div>
    </div>

    <div class="meta-grid">
      <div class="item"><span class="label">Tanggal Pesanan</span><span class="value">${esc(o.tanggalPesanan || "-")}</span></div>
      <div class="item"><span class="label">Tanggal BAST</span><span class="value">${esc(o.tanggalBast || "-")}</span></div>
      <div class="item"><span class="label">Tanggal Bayar</span><span class="value">${esc(o.tanggalBayar || "-")}</span></div>
      <div class="item"><span class="label">Kategori Belanja</span><span class="value">${esc(o.kategoriBelanja || "-")}</span></div>
      <div class="item"><span class="label">Kode Program</span><span class="value">${esc(o.kodeProgram || "-")}</span></div>
      <div class="item"><span class="label">Kode Rekening</span><span class="value">${esc(o.kodeRekening || "-")}</span></div>
      <div class="item"><span class="label">Nama Toko</span><span class="value">${esc(o.namaToko || "-")}</span></div>
      <div class="item"><span class="label">No. HP</span><span class="value">${esc(o.noHp || "-")}</span></div>
      <div class="item" style="grid-column:1 / -1;"><span class="label">Alamat Toko</span><span class="value">${esc(o.alamatToko || "-")}</span></div>
      <div class="item" style="grid-column:1 / -1;"><span class="label">Direktur Toko</span><span class="value">${esc(o.direkturToko || "-")}</span></div>
    </div>

    ${itemsTable}
    ${photosBlock}

    <div class="signature-block">
      <div class="sig">
        <div class="role">Bendahara Pengguna Anggaran</div>
        <div class="name">&nbsp;</div>
      </div>
      <div class="sig">
        <div class="role">Penerima / Toko</div>
        <div class="name">${esc(o.namaToko || "&nbsp;")}</div>
      </div>
    </div>

    <div class="page-footer">
      <span>No. Pesanan #${esc(o.noPesanan)} — BKU ${esc(o.noBku)}</span>
      <span>Laporan SPJ — Hal. ${idx}</span>
    </div>
  </div>`;
}


// ============================================================================
// LAMPIRAN GAMBAR BAST — match reference PDF (Gambar BAST PC all in one.pdf)
// Format: A4 portrait, header + divider + title + grid foto + footer
// Logos (Tokoladang/SIPLah) NOT included per user request.
// ============================================================================

type ImageOrientation = "landscape" | "portrait" | "square" | "unknown";

/**
 * Read actual image dimensions from file on disk using sharp.
 * Returns orientation:
 *   - landscape  (w / h > 1.15)  → card 4:3 landscape
 *   - portrait   (h / w > 1.15)  → card 3:4 portrait
 *   - square     (0.87 ≤ ratio ≤ 1.15) → card 1:1
 *   - unknown    (cannot read)   → fallback to landscape
 *
 * By matching the card aspect ratio to the photo's natural orientation,
 * object-fit: cover produces minimal crop — important parts stay visible.
 */
async function getImageOrientation(
  filePath: string
): Promise<ImageOrientation> {
  try {
    const absPath = join(process.cwd(), "public", filePath);
    const meta = await sharp(absPath).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w === 0 || h === 0) return "unknown";
    const ratio = w / h;
    if (ratio >= 0.87 && ratio <= 1.15) return "square";
    if (ratio > 1.15) return "landscape";
    return "portrait";
  } catch {
    return "unknown";
  }
}

interface LampiranOrder {
  id: string;
  noPesanan: string;
  noBku: string;
  uraianKegiatan: string | null;
  kategoriBelanja: string | null;
  namaToko: string | null;
  tanggalPesanan: string | null;
  tanggalBast: string | null;
  photos: Array<{
    id: string;
    url: string;
    fileName: string;
    deviceType: string;
    source: string;
    orientation: ImageOrientation;
  }>;
}

interface LampiranContext {
  mode: "all" | "order" | "bku";
  bku: string;
  orders: LampiranOrder[];
  summary: {
    totalOrders: number;
    totalItems: number;
    totalPhotos: number;
    grandTotal: number;
  };
  generatedAt: string;
  baseUrl: string;
}

/**
 * Generate "Lampiran Gambar BAST" — match reference PDF format exactly.
 *
 * Layout (per A4 page):
 *   - Margin: 25mm top, 20mm left/right, 15mm bottom
 *   - Top header: timestamp (left) + "Gambar BAST" (right)
 *   - Divider line: 1.5px black, full width
 *   - Title: "Lampiran Gambar BAST" center bold 19px
 *   - Reference: "NOMOR : 421.3/{noPesanan}-BAST/SMANSA-TD/{bulan-romawi}/{tahun}" center 11.5px
 *   - Photo grid: 2 columns, panel #EFF3F6, padding 12px, radius 10px, aspect 4:3
 *   - Footer: URL (left) + page number (right), absolute bottom
 */
function renderLampiran(ctx: LampiranContext): string {
  const { mode, bku, orders, baseUrl } = ctx;

  const totalPages = filteredOrders.length;
  const sections = orders
    .map((o, idx) => renderLampiranOrderSection(o, idx + 1, totalPages, baseUrl))
    .join("\n");

  const titleSuffix =
    mode === "order"
      ? `No. Pesanan #${orders[0].noPesanan}`
      : mode === "bku"
      ? `BKU: ${bku}`
      : "Semua No. Pesanan";

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Lampiran Gambar BAST — ${esc(titleSuffix)}</title>
<style>
  /* ============ PRINT STYLES — LAMPIRAN BAST (match reference PDF) ============ */
  @page {
    size: A4 portrait;
    margin: 25mm 20mm 15mm 20mm; /* top right bottom left — match reference */
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 12px;
    color: #000;
    background: #fff;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ===== Order section = 1 A4 page ===== */
  .order-section {
    page-break-before: always;
    width: 100%;
    min-height: 257mm; /* A4 (297mm) - top margin (25mm) - bottom margin (15mm) = 257mm */
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .order-section:first-of-type {
    page-break-before: avoid;
  }

  /* ===== Top header: timestamp (left) + "Gambar BAST" (right) ===== */
  .top-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10.5px;
    color: #000;
    margin-bottom: 35px; /* space replacing logo row */
  }
  .top-header .timestamp {
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
  .top-header .doc-label {
    font-weight: 400;
  }

  /* ===== Divider line ===== */
  .divider {
    width: 100%;
    height: 1.5px;
    background-color: #000;
    margin-bottom: 14mm; /* gap to title */
  }

  /* ===== Title + reference number (center) ===== */
  .doc-title {
    text-align: center;
    font-size: 19px;
    font-weight: 700;
    color: #000;
    margin-bottom: 5px;
    line-height: 1.3;
  }
  .doc-ref {
    text-align: center;
    font-size: 11.5px;
    font-weight: 400;
    color: #000;
    margin-bottom: 18px;
  }

  /* ===== Photo grid: 2 columns ===== */
  .photo-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    width: 100%;
    align-content: start;
    justify-items: stretch;
  }

  /* ===== Photo card: SEMUA ukuran SAMA (4:3 landscape) =====
     Profesional layout — semua card sejajar, tidak ada yang menjulang tinggi.
     - Background: #EFF3F6 (light cool gray)
     - Padding: 10px
     - Border radius: 10px
     - Aspect ratio: 4:3 (landscape, KONSISTEN untuk semua foto)
     - Image: object-fit cover + object-position center
       → Foto landscape: tampil full (no crop)
       → Foto portrait: crop bagian tengah (bagian penting tetap terlihat)
       → Foto square: crop minimal (sedikit top/bottom) */
  .photo-card {
    background-color: #EFF3F6;
    border-radius: 10px;
    padding: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    aspect-ratio: 4 / 3; /* KONSISTEN — semua card sama ukuran */
    page-break-inside: avoid;
    break-inside: avoid;
  }

  /* ===== Odd last card: center if total photos is odd (1, 3, 5, ...) =====
     When there's a lone photo in the last row (e.g. 3 photos = 2 + 1),
     center it horizontally so the layout looks neat instead of left-aligned. */
  .photo-card.last-odd {
    grid-column: 1 / -1; /* span full width of grid */
    justify-self: center; /* center within the full-width track */
    max-width: calc(50% - 8px); /* match half-width (column width minus half gap) */
  }
  .photo-card img {
    width: 100%;
    height: 100%;
    object-fit: cover; /* foto memenuhi panel */
    object-position: center; /* crop bagian tengah untuk portrait — bagian penting tetap terlihat */
    border-radius: 4px;
    display: block;
  }

  /* ===== No photos placeholder ===== */
  .no-photos {
    grid-column: 1 / -1;
    text-align: center;
    padding: 60px 20px;
    color: #9ca3af;
    font-style: italic;
    font-size: 13px;
    background: #f9fafb;
    border-radius: 10px;
  }

  /* ===== Footer: URL (left) + page number (right) — absolute bottom ===== */
  .page-footer {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 8.5px;
    color: #555;
    font-weight: 400;
  }
  .page-footer .url {
    max-width: 70%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: monospace;
    font-size: 8px;
  }
  .page-footer .page-num {
    font-weight: 500;
  }

  /* ===== Screen preview styling ===== */
  @media screen {
    body {
      background: #e5e5e5;
      padding: 20px;
    }
    .print-area {
      max-width: 794px; /* A4 width at 96dpi */
      margin: 0 auto;
      background: #fff;
      padding: 25mm 20mm 15mm 20mm;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
  }
  @media print {
    .print-area { box-shadow: none; padding: 0; }
    body { background: #fff; padding: 0; }
  }
</style>
</head>
<body>
<div class="print-area">
  ${sections}

  <script>
    (function() {
      // Auto-fill timestamps with current print time (DD/MM/YY, HH.MM)
      // matches reference PDF format
      var now = new Date();
      var dd = String(now.getDate()).padStart(2, '0');
      var mm = String(now.getMonth() + 1).padStart(2, '0');
      var yy = String(now.getFullYear()).slice(-2);
      var hh = String(now.getHours()).padStart(2, '0');
      var min = String(now.getMinutes()).padStart(2, '0');
      var ts = dd + '/' + mm + '/' + yy + ', ' + hh + '.' + min;
      var tsEls = document.querySelectorAll('.timestamp');
      for (var i = 0; i < tsEls.length; i++) tsEls[i].textContent = ts;

      var imgs = Array.from(document.images);
      var loaded = 0;
      var total = imgs.length;
      function tryPrint() {
        loaded++;
        if (loaded >= total || loaded > 30) {
          setTimeout(function() { try { window.print(); } catch(e) {} }, 400);
        }
      }
      if (total === 0) {
        setTimeout(function() { try { window.print(); } catch(e) {} }, 400);
      } else {
        imgs.forEach(function(img) {
          if (img.complete) { tryPrint(); }
          else {
            img.addEventListener('load', tryPrint);
            img.addEventListener('error', tryPrint);
          }
        });
        setTimeout(function() { try { window.print(); } catch(e) {} }, 4000);
      }
    })();
  </script>
</div>
</body>
</html>`;
}

/**
 * Convert month number (1-12) to Roman numeral.
 * 1=I, 2=II, 3=III, 4=IV, 5=V, 6=VI, 7=VII, 8=VIII, 9=IX, 10=X, 11=XI, 12=XII
 */
function monthToRoman(month: number): string {
  const romans = [
    "I", "II", "III", "IV", "V", "VI",
    "VII", "VIII", "IX", "X", "XI", "XII",
  ];
  if (month >= 1 && month <= 12) return romans[month - 1];
  return "I"; // fallback
}

/**
 * Parse tanggalBast from Excel format "DD/MM/YYYY" and extract Roman month + year.
 * Returns { romanMonth, year } for BAST number format.
 * Fallback to current date if parse fails.
 */
function parseTanggalBast(tanggalBast: string | null): {
  romanMonth: string;
  year: string;
} {
  if (!tanggalBast) {
    const now = new Date();
    return {
      romanMonth: monthToRoman(now.getMonth() + 1),
      year: String(now.getFullYear()),
    };
  }
  // Format: "DD/MM/YYYY" or "D/M/YY" or "D/M/YYYY"
  const parts = tanggalBast.split("/");
  if (parts.length < 3) {
    const now = new Date();
    return {
      romanMonth: monthToRoman(now.getMonth() + 1),
      year: String(now.getFullYear()),
    };
  }
  const month = parseInt(parts[1], 10);
  let year = parts[2].trim();
  // Handle 2-digit year (e.g. "25" → "2025")
  if (year.length === 2) year = "20" + year;
  // Validate
  if (Number.isNaN(month) || month < 1 || month > 12) {
    const now = new Date();
    return {
      romanMonth: monthToRoman(now.getMonth() + 1),
      year: String(now.getFullYear()),
    };
  }
  return { romanMonth: monthToRoman(month), year };
}

function renderLampiranOrderSection(
  o: LampiranOrder,
  pageNum: number,
  totalPages: number,
  baseUrl: string
): string {
  // Format BAST number: NOMOR : 421.3/{noPesanan}-BAST/SMANSA-TD/{bulan-romawi}/{tahun}
  // - 421.3/ = prefix tetap
  // - {noPesanan} = dari Excel (contoh: 45)
  // - -BAST/SMANSA-TD/ = middle tetap
  // - {bulan-romawi} = otomatis dari tanggalBast Excel (I-XII)
  // - {tahun} = otomatis dari tahun tanggalBast Excel
  const { romanMonth, year } = parseTanggalBast(o.tanggalBast);
  const bastNumber = `421.3/${o.noPesanan}-BAST/SMANSA-TD/${romanMonth}/${year}`;

  // Source URL (absolute, matches reference PDF footer format)
  const sourceUrl = `${baseUrl}/api/report?mode=order&noPesanan=${encodeURIComponent(
    o.noPesanan
  )}&format=lampiran`;

  // Initial timestamp (will be updated by JS for live time)
  const now = new Date();
  const ts = `${String(now.getDate()).padStart(2, "0")}/${String(
    now.getMonth() + 1
  ).padStart(2, "0")}/${String(now.getFullYear()).slice(-2)}, ${String(
    now.getHours()
  ).padStart(2, "0")}.${String(now.getMinutes()).padStart(2, "0")}`;

  // ===== Smart photo ordering for professional layout =====
  // Group by orientation: "wide" (landscape/square/unknown) vs "tall" (portrait)
  // Strategy: MAJORITY group goes first (top rows, 2 columns),
  //           MINORITY group goes last (bottom row, centered if odd count).
  //
  // Examples:
  //   3 landscape + 1 portrait  → [L,L,L, P]      (landscape 2+1, portrait 1 centered)
  //   1 landscape + 3 portrait  → [P,P,P, L]      (portrait 2+1, landscape 1 centered)
  //   2 landscape + 2 portrait  → [L,L, P,P]      (landscape 2, portrait 2)
  //   2 landscape + 1 portrait  → [L,L, P]        (landscape 2, portrait 1 centered)
  //   1 landscape + 2 portrait  → [P,P, L]        (portrait 2, landscape 1 centered)
  //
  // All cards use the SAME 4:3 aspect ratio (uniform), so no card towers above others.
  const widePhotos = o.photos.filter(
    (p) => (p.orientation || "unknown") !== "portrait"
  );
  const tallPhotos = o.photos.filter(
    (p) => p.orientation === "portrait"
  );

  // Majority first → ensures top rows are filled (2 cols), minority last
  // If equal count, default to wide (landscape) first (more natural for BAST)
  const sortedPhotos =
    tallPhotos.length > widePhotos.length
      ? [...tallPhotos, ...widePhotos]
      : [...widePhotos, ...tallPhotos];

  const photosHtml =
    sortedPhotos.length === 0
      ? '<div class="no-photos">Belum ada foto dokumentasi untuk No. Pesanan ini.</div>'
      : `<div class="photo-grid">
          ${sortedPhotos
            .map((p, i) => {
              // If total photos is odd AND this is the last photo, center it
              const isOddLast =
                sortedPhotos.length % 2 === 1 &&
                i === sortedPhotos.length - 1;
              const classes = ["photo-card"];
              if (isOddLast) classes.push("last-odd");
              return `<div class="${classes.join(" ")}">
              <img src="${esc(p.url)}" alt="Foto ${i + 1}" />
            </div>`;
            })
            .join("")}
        </div>`;

  return `<div class="order-section">
    <div class="top-header">
      <span class="timestamp">${esc(ts)}</span>
      <span class="doc-label">Gambar BAST</span>
    </div>
    <div class="divider"></div>

    <h1 class="doc-title">Lampiran Gambar BAST</h1>
    <div class="doc-ref">NOMOR : ${esc(bastNumber)}</div>

    ${photosHtml}

    <div class="page-footer">
      <span class="url">${esc(sourceUrl)}</span>
      <span class="page-num">${pageNum}/${totalPages}</span>
    </div>
  </div>`;
}
