import { db } from "../src/lib/db";

async function main() {
  console.log("Cleaning up duplicate orders...");

  // Get all orders grouped by noPesanan + noBku + yearId
  const allOrders = await db.spjOrder.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, noPesanan: true, noBku: true, yearId: true, _count: { select: { items: true, photos: true, photoLinks: true } } },
  });

  const seen = new Map<string, string>(); // key → keep this order id
  const toDelete: string[] = [];

  for (const o of allOrders) {
    const key = `${o.noPesanan}|${o.noBku}|${o.yearId || "null"}`;
    if (seen.has(key)) {
      // Duplicate! Keep the one with more items/photos
      const existingId = seen.get(key)!;
      const existing = allOrders.find(x => x.id === existingId)!;
      const existingScore = existing._count.items + existing._count.photos + existing._count.photoLinks;
      const dupScore = o._count.items + o._count.photos + o._count.photoLinks;

      if (dupScore > existingScore) {
        // This duplicate has more data — keep it, delete the old one
        toDelete.push(existingId);
        seen.set(key, o.id);
      } else {
        // Keep existing, delete this duplicate
        toDelete.push(o.id);
      }
    } else {
      seen.set(key, o.id);
    }
  }

  console.log(`Found ${toDelete.length} duplicate orders to delete`);

  if (toDelete.length > 0) {
    // Delete in order: PhotoOrderLink → SpjPhoto → SpjItem → SpjOrder
    await db.photoOrderLink.deleteMany({ where: { orderId: { in: toDelete } } });
    await db.spjPhoto.deleteMany({ where: { orderId: { in: toDelete } } });
    await db.spjItem.deleteMany({ where: { orderId: { in: toDelete } } });
    await db.spjOrder.deleteMany({ where: { id: { in: toDelete } } });
    console.log(`✅ Deleted ${toDelete.length} duplicate orders`);
  }

  // Verify
  const count = await db.spjOrder.count();
  console.log(`Remaining orders: ${count}`);
}

main().catch(console.error).finally(() => process.exit(0));
