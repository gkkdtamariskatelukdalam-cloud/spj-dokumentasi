import { db } from "../src/lib/db";

async function main() {
  // Get order #01
  const order = await db.spjOrder.findFirst({
    where: { noPesanan: "01" },
    include: {
      photos: { select: { id: true, url: true, fileName: true } },
      photoLinks: { include: { photo: { select: { id: true, url: true, fileName: true } } } },
    },
  });

  if (!order) {
    console.log("Order #01 not found");
    return;
  }

  console.log(`Order #01 (id: ${order.id})`);
  console.log(`  SpjPhoto count: ${order.photos.length}`);
  for (const p of order.photos) {
    console.log(`    - ${p.fileName} → ${p.url.substring(0, 50)}`);
  }

  console.log(`  PhotoOrderLink count: ${order.photoLinks.length}`);
  for (const l of order.photoLinks) {
    if (l.photo) {
      console.log(`    - ${l.photo.fileName} → ${l.photo.url.substring(0, 50)}`);
    } else {
      console.log(`    - ORPHANED (photo deleted, link still exists)`);
    }
  }

  // Check for orphaned links (photo is null)
  const orphaned = order.photoLinks.filter(l => !l.photo);
  console.log(`  Orphaned links: ${orphaned.length}`);

  // Check for duplicates (same URL in both SpjPhoto and PhotoOrderLink)
  const spjUrls = new Set(order.photos.map(p => p.url));
  const linkUrls = order.photoLinks.filter(l => l.photo).map(l => l.photo.url);
  const duplicates = linkUrls.filter(url => spjUrls.has(url));
  console.log(`  Duplicate URLs (in both SpjPhoto AND PhotoOrderLink): ${duplicates.length}`);
  for (const url of duplicates) {
    console.log(`    - ${url.substring(0, 50)}`);
  }

  // Actual unique photos
  const allUrls = new Set<string>();
  for (const p of order.photos) allUrls.add(p.url);
  for (const l of order.photoLinks) {
    if (l.photo) allUrls.add(l.photo.url);
  }
  console.log(`  Unique photos (deduplicated): ${allUrls.size}`);
}

main().catch(console.error).finally(() => process.exit(0));
