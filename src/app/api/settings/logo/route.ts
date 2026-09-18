import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, setAppSetting } from "@/lib/auth";
import { storeFile } from "@/lib/file-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
};

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin();
    if (!user) {
      return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File wajib diunggah" }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "File kosong" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Ukuran melebihi 5 MB" }, { status: 400 });
    }

    const ext = (file.name.toLowerCase().split(".").pop() || "").trim();
    if (!ALLOWED_EXT[ext]) {
      return NextResponse.json(
        { error: `Tipe file .${ext} tidak didukung` },
        { status: 400 }
      );
    }

    // Store file in database (works on Vercel serverless)
    const stored = await storeFile(file);

    // Update app settings: logoUrl + faviconUrl
    await setAppSetting("logoUrl", stored.url);
    await setAppSetting("faviconUrl", stored.url);

    return NextResponse.json({
      success: true,
      logoUrl: stored.url,
    });
  } catch (err) {
    console.error("POST /api/settings/logo error:", err);
    return NextResponse.json(
      { error: "Gagal mengunggah logo: " + (err instanceof Error ? err.message : "unknown") },
      { status: 500 }
    );
  }
}
