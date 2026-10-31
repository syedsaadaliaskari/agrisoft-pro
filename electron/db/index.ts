import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "fs";
import path from "path";
import { app } from "electron";
import * as schema from "./schema";
import { ensurePermissions, seedDatabase } from "./seed";
import { seedDemoData } from "./seedDemo";
import { seedDemoTransactions } from "./seedDemoTx";
import { ensureDemoClientCompanies } from "./seedCompanies";
import { ensureInstallIdentity } from "./license";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

let sqlite: Database.Database | null = null;
let db: Db | null = null;
let dbPath = "";

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** Apply schema via CREATE TABLE IF NOT EXISTS for first boot without migration files */
function applyBootstrapSchema(database: Database.Database) {
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
  `);

  // Drizzle migrator needs a migrations folder; we also create tables from schema SQL
  // generated inline for reliable first-run bootstrap.
  const statements = getBootstrapSql();
  database.exec(statements);
}

function getBootstrapSql(): string {
  // Keep in sync with schema.ts — bootstrap for empty DB
  return `
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS role_perm_unique ON role_permissions(role_id, permission_id);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role_id TEXT NOT NULL REFERENCES roles(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  group_name TEXT NOT NULL DEFAULT 'general',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  entity_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS audit_module_idx ON audit_logs(module);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  short_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  parent_id TEXT,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  barcode TEXT,
  name TEXT NOT NULL,
  description TEXT,
  category_id TEXT REFERENCES categories(id),
  unit_id TEXT REFERENCES units(id),
  brand TEXT,
  gender TEXT,
  season TEXT,
  cost_price REAL NOT NULL DEFAULT 0,
  sale_price REAL NOT NULL DEFAULT 0,
  wholesale_price REAL DEFAULT 0,
  tax_id TEXT,
  reorder_level REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS products_name_idx ON products(name);
CREATE INDEX IF NOT EXISTS products_barcode_idx ON products(barcode);

CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT NOT NULL UNIQUE,
  barcode TEXT,
  size TEXT NOT NULL,
  color TEXT NOT NULL,
  cost_price REAL,
  sale_price REAL,
  stock_qty REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS variant_unique ON product_variants(product_id, size, color);
CREATE INDEX IF NOT EXISTS variant_product_idx ON product_variants(product_id);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES product_variants(id),
  movement_type TEXT NOT NULL,
  quantity REAL NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS stock_variant_idx ON stock_movements(variant_id);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  opening_balance REAL NOT NULL DEFAULT 0,
  balance_type TEXT NOT NULL DEFAULT 'debit',
  credit_limit REAL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS customers_name_idx ON customers(name);
CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers(phone);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  opening_balance REAL NOT NULL DEFAULT 0,
  balance_type TEXT NOT NULL DEFAULT 'credit',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS vendors_name_idx ON vendors(name);

CREATE TABLE IF NOT EXISTS taxes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  rate REAL NOT NULL DEFAULT 0,
  is_inclusive INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS discounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'percent',
  value REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS additions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'fixed',
  value REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  parent_id TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  opening_balance REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS accounts_type_idx ON accounts(account_type);

CREATE TABLE IF NOT EXISTS vouchers (
  id TEXT PRIMARY KEY,
  voucher_no TEXT NOT NULL UNIQUE,
  voucher_type TEXT NOT NULL,
  voucher_date TEXT NOT NULL,
  party_type TEXT,
  party_id TEXT,
  account_id TEXT REFERENCES accounts(id),
  reference_no TEXT,
  notes TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  addition_amount REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  paid_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'posted',
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS vouchers_type_idx ON vouchers(voucher_type);
CREATE INDEX IF NOT EXISTS vouchers_date_idx ON vouchers(voucher_date);
CREATE INDEX IF NOT EXISTS vouchers_party_idx ON vouchers(party_type, party_id);

CREATE TABLE IF NOT EXISTS voucher_entries (
  id TEXT PRIMARY KEY,
  voucher_id TEXT NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  debit REAL NOT NULL DEFAULT 0,
  credit REAL NOT NULL DEFAULT 0,
  narration TEXT,
  line_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS voucher_entries_voucher_idx ON voucher_entries(voucher_id);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  voucher_id TEXT NOT NULL REFERENCES vouchers(id),
  invoice_no TEXT NOT NULL UNIQUE,
  invoice_date TEXT NOT NULL,
  customer_id TEXT REFERENCES customers(id),
  payment_mode TEXT NOT NULL DEFAULT 'cash',
  subtotal REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  addition_amount REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  paid_amount REAL NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS sales_date_idx ON sales(invoice_date);
CREATE INDEX IF NOT EXISTS sales_customer_idx ON sales(customer_id);

CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL REFERENCES product_variants(id),
  product_name TEXT NOT NULL,
  size TEXT,
  color TEXT,
  quantity REAL NOT NULL,
  unit TEXT,
  unit_price REAL NOT NULL,
  cost_price REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL,
  line_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sale_returns (
  id TEXT PRIMARY KEY,
  voucher_id TEXT NOT NULL REFERENCES vouchers(id),
  return_no TEXT NOT NULL UNIQUE,
  return_date TEXT NOT NULL,
  sale_id TEXT REFERENCES sales(id),
  customer_id TEXT REFERENCES customers(id),
  subtotal REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sale_return_items (
  id TEXT PRIMARY KEY,
  sale_return_id TEXT NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL REFERENCES product_variants(id),
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  line_total REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  voucher_id TEXT NOT NULL REFERENCES vouchers(id),
  invoice_no TEXT NOT NULL UNIQUE,
  invoice_date TEXT NOT NULL,
  vendor_id TEXT REFERENCES vendors(id),
  payment_mode TEXT NOT NULL DEFAULT 'credit',
  subtotal REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  addition_amount REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  paid_amount REAL NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS purchases_date_idx ON purchases(invoice_date);
CREATE INDEX IF NOT EXISTS purchases_vendor_idx ON purchases(vendor_id);

CREATE TABLE IF NOT EXISTS purchase_items (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL REFERENCES product_variants(id),
  product_name TEXT NOT NULL,
  size TEXT,
  color TEXT,
  quantity REAL NOT NULL,
  unit TEXT,
  unit_cost REAL NOT NULL,
  discount_amount REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL,
  line_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS purchase_returns (
  id TEXT PRIMARY KEY,
  voucher_id TEXT NOT NULL REFERENCES vouchers(id),
  return_no TEXT NOT NULL UNIQUE,
  return_date TEXT NOT NULL,
  purchase_id TEXT REFERENCES purchases(id),
  vendor_id TEXT REFERENCES vendors(id),
  subtotal REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id TEXT PRIMARY KEY,
  purchase_return_id TEXT NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL REFERENCES product_variants(id),
  quantity REAL NOT NULL,
  unit_cost REAL NOT NULL,
  line_total REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS document_counters (
  id TEXT PRIMARY KEY,
  doc_type TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  next_number INTEGER NOT NULL DEFAULT 1,
  pad_length INTEGER NOT NULL DEFAULT 5,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS client_companies (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  area TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS client_companies_area_idx ON client_companies(area);
CREATE INDEX IF NOT EXISTS client_companies_joined_idx ON client_companies(joined_at);

CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  install_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  activated_at TEXT NOT NULL,
  expires_at TEXT,
  notes TEXT,
  phone TEXT,
  tenant_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS licenses_install_idx ON licenses(install_id);
`;
}

export function getDbPath(): string {
  return dbPath;
}

export function getSqlite(): Database.Database {
  if (!sqlite) throw new Error("Database not initialized");
  return sqlite;
}

export async function initDatabase(): Promise<Db> {
  if (db) return db;

  const isDev = !app.isPackaged;
  const userData = isDev
    ? path.join(process.cwd(), "data")
    : path.join(app.getPath("userData"), "data");

  ensureDir(userData);
  dbPath = path.join(userData, isDev ? "agri-soft-pro.dev.db" : "agri-soft-pro.db");

  sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");

  applyBootstrapSchema(sqlite);
  try {
    sqlite.exec("ALTER TABLE licenses ADD COLUMN phone TEXT");
  } catch {
    // column already exists
  }
  try {
    sqlite.exec("ALTER TABLE licenses ADD COLUMN tenant_id TEXT");
  } catch {
    // column already exists
  }
  for (const table of ["sale_items", "purchase_items"]) {
    try {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN unit TEXT`);
    } catch {
      // column already exists
    }
  }
  for (const statement of [
    "ALTER TABLE products ADD COLUMN track_batch INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE products ADD COLUMN is_crop INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE purchase_items ADD COLUMN batch_no TEXT",
    "ALTER TABLE purchase_items ADD COLUMN manufactured_date TEXT",
    "ALTER TABLE purchase_items ADD COLUMN expiry_date TEXT",
    "ALTER TABLE stock_batches ADD COLUMN manufactured_date TEXT",
    "ALTER TABLE sale_items ADD COLUMN batch_no TEXT",
    "ALTER TABLE sale_items ADD COLUMN expiry_date TEXT",
    "ALTER TABLE crop_sales ADD COLUMN commission REAL NOT NULL DEFAULT 0",
    "ALTER TABLE crop_sales ADD COLUMN brokerage REAL NOT NULL DEFAULT 0",
    "ALTER TABLE crop_sales ADD COLUMN mazdoori REAL NOT NULL DEFAULT 0",
    "ALTER TABLE crop_sales ADD COLUMN fees REAL NOT NULL DEFAULT 0",
    "ALTER TABLE crop_sales ADD COLUMN bardana REAL NOT NULL DEFAULT 0",
    "ALTER TABLE crop_sales ADD COLUMN deduction_amount REAL NOT NULL DEFAULT 0",
    "ALTER TABLE crop_sales ADD COLUMN net_amount REAL NOT NULL DEFAULT 0",
    "ALTER TABLE crop_sales ADD COLUMN cost_amount REAL NOT NULL DEFAULT 0",
    "ALTER TABLE units ADD COLUMN equals_kg REAL",
    "ALTER TABLE crop_purchase_vehicles ADD COLUMN stock_factor REAL NOT NULL DEFAULT 1",
    "ALTER TABLE crop_purchase_vehicles ADD COLUMN weigh_unit TEXT",
    "ALTER TABLE crop_purchase_vehicles ADD COLUMN kaat_factor REAL NOT NULL DEFAULT 1",
    "ALTER TABLE crop_purchase_vehicles ADD COLUMN kaat_unit TEXT",
    "ALTER TABLE crop_sales ADD COLUMN stock_factor REAL NOT NULL DEFAULT 1",
    "ALTER TABLE crop_sales ADD COLUMN weigh_unit TEXT",
    "ALTER TABLE crop_purchases ADD COLUMN stock_weight REAL",
    "ALTER TABLE crop_sales ADD COLUMN kaat REAL NOT NULL DEFAULT 0",
    "ALTER TABLE crop_sales ADD COLUMN safi_weight REAL",
  ]) {
    try {
      sqlite.exec(statement);
    } catch {
      // column already exists
    }
  }
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS stock_batches (
      id TEXT PRIMARY KEY,
      variant_id TEXT NOT NULL REFERENCES product_variants(id),
      batch_no TEXT NOT NULL,
      manufactured_date TEXT,
      expiry_date TEXT,
      qty REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS stock_batch_unique ON stock_batches(variant_id, batch_no);
    CREATE INDEX IF NOT EXISTS stock_batch_variant_idx ON stock_batches(variant_id);
    CREATE INDEX IF NOT EXISTS stock_batch_expiry_idx ON stock_batches(expiry_date);

    CREATE TABLE IF NOT EXISTS crop_purchases (
      id TEXT PRIMARY KEY,
      voucher_id TEXT NOT NULL REFERENCES vouchers(id),
      doc_no TEXT NOT NULL UNIQUE,
      doc_date TEXT NOT NULL,
      party_type TEXT NOT NULL,
      party_id TEXT NOT NULL,
      variant_id TEXT NOT NULL REFERENCES product_variants(id),
      product_name TEXT NOT NULL,
      safi_weight REAL NOT NULL DEFAULT 0,
      gross_amount REAL NOT NULL DEFAULT 0,
      commission REAL NOT NULL DEFAULT 0,
      brokerage REAL NOT NULL DEFAULT 0,
      mazdoori REAL NOT NULL DEFAULT 0,
      fees REAL NOT NULL DEFAULT 0,
      bardana REAL NOT NULL DEFAULT 0,
      deduction_amount REAL NOT NULL DEFAULT 0,
      net_payable REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      remarks TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS crop_purchases_date_idx ON crop_purchases(doc_date);
    CREATE INDEX IF NOT EXISTS crop_purchases_party_idx ON crop_purchases(party_type, party_id);

    CREATE TABLE IF NOT EXISTS crop_purchase_vehicles (
      id TEXT PRIMARY KEY,
      crop_purchase_id TEXT NOT NULL REFERENCES crop_purchases(id) ON DELETE CASCADE,
      vehicle_no TEXT NOT NULL,
      bags REAL NOT NULL DEFAULT 0,
      total_weight REAL NOT NULL,
      kaat REAL NOT NULL DEFAULT 0,
      safi_weight REAL NOT NULL,
      rate REAL NOT NULL,
      amount REAL NOT NULL,
      line_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS crop_sales (
      id TEXT PRIMARY KEY,
      voucher_id TEXT NOT NULL REFERENCES vouchers(id),
      doc_no TEXT NOT NULL UNIQUE,
      doc_date TEXT NOT NULL,
      customer_id TEXT REFERENCES customers(id),
      variant_id TEXT NOT NULL REFERENCES product_variants(id),
      product_name TEXT NOT NULL,
      weight REAL NOT NULL,
      rate REAL NOT NULL,
      amount REAL NOT NULL,
      paid_amount REAL NOT NULL DEFAULT 0,
      remarks TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS crop_sales_date_idx ON crop_sales(doc_date);

    CREATE TABLE IF NOT EXISTS crop_purchase_returns (
      id TEXT PRIMARY KEY,
      voucher_id TEXT NOT NULL REFERENCES vouchers(id),
      doc_no TEXT NOT NULL UNIQUE,
      doc_date TEXT NOT NULL,
      purchase_id TEXT NOT NULL REFERENCES crop_purchases(id),
      party_type TEXT NOT NULL,
      party_id TEXT NOT NULL,
      party_name TEXT,
      variant_id TEXT NOT NULL REFERENCES product_variants(id),
      product_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_name TEXT,
      safi_weight REAL NOT NULL DEFAULT 0,
      stock_qty REAL NOT NULL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      remarks TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS crop_sale_returns (
      id TEXT PRIMARY KEY,
      voucher_id TEXT NOT NULL REFERENCES vouchers(id),
      doc_no TEXT NOT NULL UNIQUE,
      doc_date TEXT NOT NULL,
      sale_id TEXT NOT NULL REFERENCES crop_sales(id),
      customer_id TEXT REFERENCES customers(id),
      customer_name TEXT,
      variant_id TEXT NOT NULL REFERENCES product_variants(id),
      product_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_name TEXT,
      safi_weight REAL NOT NULL DEFAULT 0,
      stock_qty REAL NOT NULL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0,
      cost_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      remarks TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db = drizzle(sqlite, { schema });

  // Optional: run drizzle migrations if folder exists
  const migrationsPath = app.isPackaged
    ? path.join(process.resourcesPath, "migrations")
    : path.join(process.cwd(), "electron", "db", "migrations");
  if (fs.existsSync(migrationsPath)) {
    try {
      migrate(db, { migrationsFolder: migrationsPath });
    } catch {
      // Bootstrap schema already applied
    }
  }

  await seedDatabase(db, { production: !isDev });
  ensurePermissions(db);
  const { ensureDocumentPrefixes } = await import("./counters");
  ensureDocumentPrefixes(db);
  // Heavy demo (products, cashier, sample sales) — development only
  if (isDev) {
    await seedDemoData(db);
    await seedDemoTransactions(db);
    ensureDemoClientCompanies(db);
  }
  ensureInstallIdentity(db);
  return db;
}

export function getDb(): Db {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

export function closeDatabase(): void {
  if (sqlite) {
    try {
      sqlite.pragma("wal_checkpoint(TRUNCATE)");
    } catch {
      // ignore checkpoint errors on shutdown
    }
    sqlite.close();
    sqlite = null;
    db = null;
  }
}

/** Online backup of the open DB (safe with WAL). */
export async function createDbBackupFile(destPath: string): Promise<void> {
  if (!sqlite) {
    throw new Error("Database not initialized");
  }
  ensureDir(path.dirname(destPath));
  if (fs.existsSync(destPath)) {
    fs.unlinkSync(destPath);
  }
  await sqlite.backup(destPath);
}

/** Live DB path plus WAL/SHM sidecars. */
export function getDbRelatedPaths(livePath = getDbPath()): string[] {
  return [livePath, `${livePath}-wal`, `${livePath}-shm`];
}
