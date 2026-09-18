import { db } from "@/lib/db";
import sharp from "sharp";

/**
 * Store a file in the database (base64 encoded).
 * Used on Vercel where filesystem is read-only.
 *
 * Images are automatically resized and compressed before storage:
 *   - Max dimension: 1280px (preserve aspect ratio)
 *   - JPEG quality: 80%
 *   - PNG: preserved (lossless)
 *   - SVG/ICO: stored as-is (vector/icon, no resize needed)
 *
 * This reduces a typical 5MB phone photo to ~200-400KB,
 * keeping the Neon database small and fast.
 *
 * @param file - File object from FormData
 * @returns { id, url, fileName, fileSize, mimeType }
 */
export async function storeFile(file: File): Promise<{
  id: string;
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}> {
  const ext = file.name.toLowerCase().split(".").pop() || "jpg";
  const isSvg = ext === "svg";
  const isIco = ext === "ico";

  let buffer: Buffer;
  let mimeType: string;

  if (isSvg || isIco) {
    // SVG and ICO: store as-is (vector/icon, no resize)
    buffer = Buffer.from(await file.arrayBuffer());
    mimeType = isSvg ? "image/svg+xml" : "image/x-icon";
  } else {
    // Raster images (jpg, png, webp): resize + compress with sharp
    const rawBuffer = Buffer.from(await file.arrayBuffer());

    try {
      // Get image metadata
      const meta = await sharp(rawBuffer).metadata();
      const width = meta.width || 0;
      const height = meta.height || 0;

      // Resize if larger than 1280px (preserve aspect ratio, don't upscale)
      const resizeOptions: sharp.ResizeOptions = {
        width: 1280,
        height: 1280,
        fit: "inside",
        withoutEnlargement: true,
      };

      // Convert to JPEG for photos (best compression)
      // Keep PNG for images with transparency
      if (ext === "png" && meta.hasAlpha) {
        // PNG with transparency: compress as PNG (lossless, optimized)
        buffer = await sharp(rawBuffer)
          .resize(resizeOptions)
          .png({ quality: 80, compressionLevel: 9 })
          .toBuffer();
        mimeType = "image/png";
      } else {
        // JPEG/WEBP/others: convert to JPEG (best compression for photos)
        buffer = await sharp(rawBuffer)
          .resize(resizeOptions)
          .jpeg({ quality: 80, mozjpeg: true })
          .toBuffer();
        mimeType = "image/jpeg";
      }

      console.log(
        `[storeFile] ${file.name}: ${width}x${height} → compressed ${rawBuffer.length} → ${buffer.length} bytes (${Math.round((1 - buffer.length / rawBuffer.length) * 100)}% reduction)`
      );
    } catch (sharpErr) {
      // If sharp fails (e.g., HEIC), fall back to raw storage
      console.error("[storeFile] sharp error, storing raw:", sharpErr);
      buffer = rawBuffer;
      mimeType =
        ext === "png"
          ? "image/png"
          : ext === "webp"
          ? "image/webp"
          : "image/jpeg";
    }
  }

  const base64Data = buffer.toString("base64");

  const stored = await db.storedFile.create({
    data: {
      data: base64Data,
      mimeType,
      fileSize: buffer.length,
      fileName: file.name,
    },
  });

  return {
    id: stored.id,
    url: `/api/file/${stored.id}`,
    fileName: file.name,
    fileSize: buffer.length,
    mimeType,
  };
}
