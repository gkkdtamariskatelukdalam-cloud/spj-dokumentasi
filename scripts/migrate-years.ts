import { db } from "../src/lib/db";

async function main() {
  // Create default year 2025
  const existingYear = await db.spjYear.findFirst({ where: { year: 2025 } });
  let year2025;
  if (!existingYear) {
    year2025 = await db.spjYear.create({
      data: { year: 2025, isActive: true, label: "Tahun Anggaran 2025" },
    });
    console.log(`✅ Created year 2025 (id: ${year2025.id})`);
  } else {
    year2025 = existingYear;
    console.log(`Year 2025 already exists (id: ${year2025.id})`);
  }

  // Assign all existing orders to year 2025
  const ordersWithoutYear = await db.spjOrder.count({ where: { yearId: null } });
  if (ordersWithoutYear > 0) {
    await db.spjOrder.updateMany({
      where: { yearId: null },
      data: { yearId: year2025.id },
    });
    console.log(`✅ Assigned ${ordersWithoutYear} orders to year 2025`);
  } else {
    console.log("All orders already have yearId");
  }

  // Assign all existing documentation photos to year 2025
  const docsWithoutYear = await db.documentationPhoto.count({ where: { yearId: null } });
  if (docsWithoutYear > 0) {
    await db.documentationPhoto.updateMany({
      where: { yearId: null },
      data: { yearId: year2025.id },
    });
    console.log(`✅ Assigned ${docsWithoutYear} doc photos to year 2025`);
  } else {
    console.log("All doc photos already have yearId");
  }

  // Assign import logs
  const logsWithoutYear = await db.importLog.count({ where: { yearId: null } });
  if (logsWithoutYear > 0) {
    await db.importLog.updateMany({
      where: { yearId: null },
      data: { yearId: year2025.id },
    });
    console.log(`✅ Assigned ${logsWithoutYear} import logs to year 2025`);
  }

  // Also create 2024 for future use
  const year2024 = await db.spjYear.findFirst({ where: { year: 2024 } });
  if (!year2024) {
    await db.spjYear.create({
      data: { year: 2024, isActive: true, label: "Tahun Anggaran 2024" },
    });
    console.log(`✅ Created year 2024`);
  }

  // Verify
  const allYears = await db.spjYear.findMany({ orderBy: { year: "desc" } });
  console.log("\nYears in database:");
  for (const y of allYears) {
    const orderCount = await db.spjOrder.count({ where: { yearId: y.id } });
    console.log(`  ${y.year} (${y.isActive ? "active" : "inactive"}) — ${orderCount} orders`);
  }

  console.log("\nMigration done!");
}

main().catch(console.error).finally(() => process.exit(0));
