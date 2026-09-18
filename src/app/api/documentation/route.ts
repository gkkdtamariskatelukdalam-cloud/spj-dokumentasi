import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { storeFile } from "@/lib/file-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const ALLOWED_MIME = [
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif",
];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() || "";
    const status = searchParams.get("status") || "all";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));

    const allPhotos = await db.documentationPhoto.findMany({
      include: { links: { include: { order: { select: { noPesanan: true, noBku: true, uraianKegiatan: true } } } } },
      orderBy: { createdAt: "desc" },
    });

    const withStatus = allPhotos.map((p) => ({
      ...p,
      links: p.links.map((l) => ({
        orderId: l.orderId,
        noPesanan: l.order?.noPesanan || "",
        noBku: l.order?.noBku || "",
        uraianKegiatan: l.order?.uraianKegiatan || null,
      })),
      linkedCount: p.links.length,
    }));

    let filtered = withStatus;
    if (q) {
      const lowerQ = q.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.fileName.toLowerCase().includes(lowerQ) ||
          (p.caption || "").toLowerCase().includes(lowerQ)
      );
    }
    if (status === "used") filtered = filtered.filter((p) => p.links.length > 0);
    else if (status === "unused") filtered = filtered.filter((p) => p.links.length === 0);

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

    return NextResponse.json({
      photos: paged,
      total,
      page,
      pageSize,
      totalPages,
    });
  } catch (err) {
    console.error("GET /api/documentation error:", err);
    return NextResponse.json({ error: "Gagal memuat dokumentasi foto" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files");
    const deviceType = (formData.get("deviceType") as string) || "upload";
    const source = (formData.get("source") as string) || "laptop";

    if (files.length === 0) {
      return NextResponse.json({ error: "Tidak ada file" }, { status: 400 });
    }

    const saved: Array<{ id: string; url: string; fileName: string; fileSize: number }> = [];
    const errors: string[] = [];

    for (const f of files) {
      if (!(f instanceof File)) continue;
      if (f.size === 0) { errors.push(`${f.name}: file kosong`); continue; }
      if (f.size > MAX_FILE_SIZE) { errors.push(`${f.name}: melebihi 15 MB`); continue; }

      const mime = f.type || "image/jpeg";
      if (!ALLOWED_MIME.includes(mime) && !mime.startsWith("image/")) {
        errors.push(`${f.name}: tipe tidak didukung`);
        continue;
      }

      try {
        // Store file in database (Vercel-compatible)
        const stored = await storeFile(f);

        const photo = await db.documentationPhoto.create({
          data: {
            fileName: f.name,
            filePath: stored.url,
            url: stored.url,
            fileSize: stored.fileSize,
            mimeType: stored.mimeType,
            deviceType,
            source,
          },
        });

        saved.push({
          id: photo.id,
          url: photo.url,
          fileName: photo.fileName,
          fileSize: photo.fileSize,
        });
      } catch (storeErr) {
        console.error("storeFile error:", storeErr);
        errors.push(`${f.name}: gagal menyimpan`);
      }
    }

    return NextResponse.json({
      success: true,
      saved,
      errors,
      count: saved.length,
    });
  } catch (err) {
    console.error("POST /api/documentation error:", err);
    return NextResponse.json(
      { error: "Gagal upload: " + (err instanceof Error ? err.message : "unknown") },
      { status: 500 }
    );
  }
}
