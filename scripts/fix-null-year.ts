import { db } from "../src/lib/db";

async function main() {
  // Get orders with yearId = null
  const nullOrders = await db.spjOrder.findMany({
    where: { yearId: null },
    select: { id: true, noPesanan: true },
  });
  console.log(`Found ${nullOrders.length} orders with yearId=null`);

  if (nullOrders.length === 0) {
    console.log("Nothing to clean");
    return;
  }

  const idsToDelete = nullOrders.map((o) => o.id);

  // Delete in order
  console.log("Deleting PhotoOrderLink...");
  const links = await db.photoOrderLink.deleteMany({ where: { orderId: { in: idsToDelete } } });
  console.log(`  Deleted ${links.count} links`);

  console.log("Deleting SpjPhoto...");
  const photos = await db.spjPhoto.deleteMany({ where: { orderId: { in: idsToDelete } } });
  console.log(`  Deleted ${photos.count} photos`);

  console.log("Deleting SpjItem...");
  const items = await db.spjItem.deleteMany({ where: { orderId: { in: idsToDelete } } });
  console.log(`  Deleted ${items.count} items`);

  console.log("Deleting SpjOrder...");
  const orders = await db.spjOrder.deleteMany({ where: { id: { in: idsToDelete } } });
  console.log(`  Deleted ${orders.count} orders`);

  // Verify
  const remaining = await db.spjOrder.count();
  console.log(`\nRemaining orders: ${remaining}`);

  const withYear = await db.spjOrder.count({ where: { yearId: { not: null } } });
  const withoutYear = await db.spjOrder.count({ where: { yearId: null } });
  console.log(`  With yearId: ${withYear}`);
  console.log(`  Without yearId: ${withoutYear}`);
}

main().catch(console.error).finally(() => process.exit(0));
