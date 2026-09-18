import { db } from "@/lib/db";

/**
 * Store a file in the database (base64 encoded).
 * Used on Vercel where filesystem is read-only.
 *
 * @param file - File object from FormData
 * @returns { id, url } where url = `/api/file/{id}`
 */
export async function storeFile(file: File): Promise<{
  id: string;
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64Data = buffer.toString("base64");

  const ext = file.name.toLowerCase().split(".").pop() || "jpg";
  const mimeType =
    ext === "png"
      ? "image/png"
      : ext === "webp"
      ? "image/webp"
      : ext === "svg"
      ? "image/svg+xml"
      : ext === "ico"
      ? "image/x-icon"
      : "image/jpeg";

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
