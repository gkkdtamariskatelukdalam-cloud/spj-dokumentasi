import { db } from "../src/lib/db";

async function main() {
  // Check per year
  const years = await db.spjYear.findMany();
  for (const y of years) {
    const count = await db.spjOrder.count({ where: { yearId: y.id } });
    console.log(`Year ${y.year}: ${count} orders`);
  }

  // Check orders without yearId
  const noYear = await db.spjOrder.count({ where: { yearId: null } });
  console.log(`No yearId: ${noYear} orders`);

  // Check actual duplicates by noPesanan + noBku
  const allOrders = await db.spjOrder.findMany({
    select: { id: true, noPesanan: true, noBku: true, yearId: true },
    orderBy: { noPesanan: "asc" },
  });

  const keyCount = new Map<string, number>();
  for (const o of allOrders) {
    const key = `${o.noPesanan}|${o.noBku}|${o.yearId || "null"}`;
    keyCount.set(key, (keyCount.get(key) || 0) + 1);
  }

  let dupes = 0;
  for (const [key, count] of keyCount) {
    if (count > 1) {
      dupes++;
      console.log(`  DUPE: ${key} → ${count} copies`);
    }
  }
  console.log(`\nTotal unique keys: ${keyCount.size}`);
  console.log(`Total dupes (count > 1): ${dupes}`);
  console.log(`Total orders: ${allOrders.length}`);
}

main().catch(console.error).finally(() => process.exit(0));
