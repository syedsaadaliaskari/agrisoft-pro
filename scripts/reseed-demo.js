/**
 * Force full demo reseed using Electron's better-sqlite3 build.
 * Usage: npm run db:reseed
 */
const path = require("path");
const { app } = require("electron");
const { eq, sql } = require("drizzle-orm");

async function main() {
  await app.whenReady();

  const dbMod = require(path.join(process.cwd(), "dist-electron/electron/db/index.js"));
  const { seedDemoTransactions } = require(path.join(process.cwd(), "dist-electron/electron/db/seedDemoTx.js"));
  const schema = require(path.join(process.cwd(), "dist-electron/electron/db/schema.js"));

  await dbMod.initDatabase();
  const db = dbMod.getDb();

  // Drop seed flags so seedDemoTransactions will run
  db.delete(schema.settings)
    .where(eq(schema.settings.key, "demo_full_seeded_v1"))
    .run();
  db.delete(schema.settings)
    .where(eq(schema.settings.key, "demo_tx_seeded"))
    .run();

  await seedDemoTransactions(db);

  const countOf = (table) => db.select({ value: sql`count(*)` }).from(table).get()?.value ?? 0;

  const counts = {
    products: countOf(schema.products),
    customers: countOf(schema.customers),
    vendors: countOf(schema.vendors),
    sales: countOf(schema.sales),
    purchases: countOf(schema.purchases),
    saleReturns: countOf(schema.saleReturns),
    purchaseReturns: countOf(schema.purchaseReturns),
    vouchers: countOf(schema.vouchers),
  };

  console.log("Reseed complete:", counts);
  dbMod.closeDatabase();
  app.exit(0);
}

main().catch((err) => {
  console.error(err);
  app.exit(1);
});
