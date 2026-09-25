import { db } from "../src/lib/db";

async function main() {
  console.log("Cleaning up duplicate SpjPhoto records...");

  // Get all SpjPhoto with their URLs
  const spjPhotos = await db.spjPhoto.findMany({
    select: { id: true, url: true, orderId: true },
  });
  console.log(`Total SpjPhoto records: ${spjPhotos.length}`);

  // Get all DocumentationPhoto URLs
  const docPhotos = await db.documentationPhoto.findMany({
    select: { id: true, url: true },
  });
  const docUrls = new Set(docPhotos.map(p => p.url));

  // Find SpjPhoto that have matching DocumentationPhoto (same URL = duplicate)
  const duplicates = spjPhotos.filter(p => docUrls.has(p.url));
  console.log(`SpjPhoto with matching DocumentationPhoto (duplicates): ${duplicates.length}`);

  // Find SpjPhoto WITHOUT matching DocumentationPhoto (orphaned — need to create DocPhoto)
  const orphans = spjPhotos.filter(p => !docUrls.has(p.url));
  console.log(`SpjPhoto without DocumentationPhoto (need migration): ${orphans.length}`);

  // For orphans: create DocumentationPhoto + PhotoOrderLink
  for (const orphan of orphans) {
    const existingDoc = await db.documentationPhoto.findFirst({
      where: { url: orphan.url },
    });
    if (!existingDoc) {
      const newDoc = await db.documentationPhoto.create({
        data: {
          fileName: orphan.fileName || orphan.url,
          filePath: orphan.filePath || orphan.url,
          url: orphan.url,
          fileSize: orphan.fileSize,
          mimeType: orphan.mimeType,
          deviceType: orphan.deviceType,
          source: orphan.source,
        },
      });
      await db.photoOrderLink.create({
        data: { photoId: newDoc.id, orderId: orphan.orderId },
      }).catch(() => {});
      console.log(`  Migrated orphan: ${orphan.url.substring(0, 50)}`);
    }
  }

  // Delete ALL SpjPhoto records (they're all duplicated in DocumentationPhoto now)
  const deleted = await db.spjPhoto.deleteMany({});
  console.log(`✅ Deleted ${deleted.count} SpjPhoto records (all migrated to DocumentationPhoto)`);

  // Also clean up orphaned PhotoOrderLink records
  const orphanedLinks = await db.photoOrderLink.deleteMany({
    where: { photo: { is: null } },
  });
  console.log(`✅ Deleted ${orphanedLinks.count} orphaned PhotoOrderLink records`);

  // Verify order #01
  const order = await db.spjOrder.findFirst({
    where: { noPesanan: "01" },
    include: {
      photos: true,
      photoLinks: { include: { photo: true } },
    },
  });
  if (order) {
    console.log(`\nOrder #01 verification:`);
    console.log(`  SpjPhoto count: ${order.photos.length} (should be 0)`);
    console.log(`  PhotoOrderLink count: ${order.photoLinks.length}`);
    const validLinks = order.photoLinks.filter(l => l.photo);
    console.log(`  Valid links (photo exists): ${validLinks.length}`);
    console.log(`  Actual unique photos: ${validLinks.length}`);
  }
}

main().catch(console.error).finally(() => process.exit(0));
