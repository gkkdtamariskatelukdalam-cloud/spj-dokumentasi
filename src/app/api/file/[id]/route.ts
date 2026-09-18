import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/file/[id]
 * Serve a stored file from database (base64 → binary).
 * Used for serving photos/logos on Vercel where filesystem is read-only.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const file = await db.storedFile.findUnique({ where: { id } });

    if (!file) {
      return new NextResponse("File not found", { status: 404 });
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(file.data, "base64");

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": file.mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    console.error("GET /api/file/[id] error:", err);
    return new NextResponse("Internal error", { status: 500 });
  }
}
