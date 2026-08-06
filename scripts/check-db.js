const Database = require("better-sqlite3");
const db = new Database("data/agri-soft-pro.dev.db");
const tables = [
  "products",
  "customers",
  "vendors",
  "sales",
  "purchases",
  "vouchers",
  "product_variants",
];
for (const t of tables) {
  try {
    console.log(t, db.prepare(`select count(*) as c from ${t}`).get().c);
  } catch {
    console.log(t, "missing");
  }
}
console.log(
  "demo settings",
  db.prepare("select key, value from settings where key like 'demo%'").all()
);
db.close();
