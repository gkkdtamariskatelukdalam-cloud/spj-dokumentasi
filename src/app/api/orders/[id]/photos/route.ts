import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { storeFile } from "@/lib/file-storage";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB
const ALLOWED_MIME = [
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif",
];

function detectSource(ua: string): string {
  const lower = ua.toLowerCase();
  if (/android/.test(lower)) return "android";
  if (/iphone|ipad|ipod/.test(lower)) return "ios";
  if (/mobile/.test(lower)) return "mobile";
  return "laptop";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const order = await db.spjOrder.findUnique({ where: { id } });
    if (!order) {
      return NextResponse.json({ error: "Order tidak ditemukan" }, { status: 404 });
    }

    const formData = await req.formData();
    const files = formData.getAll("files");
    const deviceType = (formData.get("deviceType") as string) || "upload";
    const source = (formData.get("source") as string) || detectSource(req.headers.get("user-agent") || "");

    if (files.length === 0) {
      return NextResponse.json({ error: "Tidak ada file" }, { status: 400 });
    }

    const saved: Array<{ id: string; url: string; fileName: string; fileSize: number; deviceType: string; source: string }> = [];
    const errors: string[] = [];

    for (const f of files) {
      if (!(f instanceof File)) continue;
      if (f.size === 0) { errors.push(`${f.name}: file kosong`); continue; }
      if (f.size > MAX_FILE_SIZE) { errors.push(`${f.name}: melebihi 4 MB`); continue; }

      const mime = f.type || "image/jpeg";
      if (!ALLOWED_MIME.includes(mime) && !mime.startsWith("image/")) {
        errors.push(`${f.name}: tipe tidak didukung`);
        continue;
      }

      try {
        // Store file in database (Vercel-compatible — no filesystem writes)
        const stored = await storeFile(f);

        // Create SpjPhoto record
        const photo = await db.spjPhoto.create({
          data: {
            orderId: order.id,
            fileName: f.name,
            filePath: stored.url,
            url: stored.url,
            fileSize: stored.fileSize,
            mimeType: stored.mimeType,
            deviceType,
            source,
          },
        });

        // Also create DocumentationPhoto + PhotoOrderLink
        const docPhoto = await db.documentationPhoto.create({
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
        await db.photoOrderLink.create({
          data: { photoId: docPhoto.id, orderId: order.id },
        }).catch(() => {});

        saved.push({
          id: photo.id,
          url: photo.url,
          fileName: photo.fileName,
          fileSize: photo.fileSize,
          deviceType: photo.deviceType,
          source: photo.source,
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
    console.error("POST /api/orders/[id]/photos error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
