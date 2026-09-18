/**
 * Seed script for production (Neon PostgreSQL)
 * Run after `prisma db push` to create default admin + settings
 * Usage: bun scripts/seed-production.ts
 */
import { db } from "../src/lib/db";
import bcrypt from "bcryptjs";

async function main() {
  console.log("Seeding production database...");

  // Create default admin if not exists
  const existing = await db.user.findFirst({ where: { username: "admin" } });
  if (!existing) {
    const hash = bcrypt.hashSync("admin123", 10);
    await db.user.create({
      data: {
        username: "admin",
        password: hash,
        role: "admin",
        isActive: true,
        displayName: "Administrator",
      },
    });
    console.log("✅ Default admin created (admin/admin123)");
  } else {
    console.log("Admin already exists");
  }

  // Default app settings
  const defaults = [
    { key: "appName", value: "Dokumentasi SPJ" },
    { key: "appDescription", value: "Sistem Dokumentasi Laporan Surat Pertanggungjawaban" },
    { key: "logoUrl", value: "" },
    { key: "faviconUrl", value: "" },
  ];
  for (const s of defaults) {
    const ex = await db.appSetting.findUnique({ where: { key: s.key } });
    if (!ex) {
      await db.appSetting.create({ data: s });
      console.log(`✅ Setting "${s.key}" created`);
    }
  }
  console.log("Done!");
}

main().catch(console.error).finally(() => process.exit(0));
