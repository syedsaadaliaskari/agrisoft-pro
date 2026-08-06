import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import type { Db } from "./index";
import {
  roles,
  permissions,
  rolePermissions,
  users,
  units,
  categories,
  taxes,
  accounts,
  settings,
  documentCounters,
} from "./schema";

export const PERMISSION_CATALOG = [
  { code: "dashboard.view", module: "dashboard", description: "View dashboard" },
  { code: "products.view", module: "products", description: "View products" },
  { code: "products.manage", module: "products", description: "Create/edit products" },
  { code: "inventory.view", module: "inventory", description: "View inventory" },
  { code: "inventory.manage", module: "inventory", description: "Adjust inventory" },
  { code: "customers.view", module: "customers", description: "View customers" },
  { code: "customers.manage", module: "customers", description: "Manage customers" },
  { code: "vendors.view", module: "vendors", description: "View vendors" },
  { code: "vendors.manage", module: "vendors", description: "Manage vendors" },
  { code: "sales.view", module: "sales", description: "View sales" },
  { code: "sales.create", module: "sales", description: "Create sales" },
  { code: "sales.return", module: "sales", description: "Sale returns" },
  { code: "purchases.view", module: "purchases", description: "View purchases" },
  { code: "purchases.create", module: "purchases", description: "Create purchases" },
  { code: "purchases.return", module: "purchases", description: "Purchase returns" },
  { code: "transactions.view", module: "transactions", description: "View pay/receive" },
  { code: "transactions.create", module: "transactions", description: "Create pay/receive" },
  { code: "ledgers.view", module: "ledgers", description: "View ledgers" },
  { code: "reports.view", module: "reports", description: "View reports" },
  { code: "settings.manage", module: "settings", description: "Manage settings" },
  { code: "users.manage", module: "users", description: "Manage users & roles" },
  {
    code: "platform.view",
    module: "platform",
    description: "Super Admin: client companies & demand by area",
  },
] as const;

const DEFAULT_ACCOUNTS = [
  { code: "1000", name: "Assets", accountType: "asset" },
  { code: "1100", name: "Cash in Hand", accountType: "asset" },
  { code: "1200", name: "Bank Account", accountType: "asset" },
  { code: "1300", name: "Accounts Receivable", accountType: "asset" },
  { code: "1400", name: "Inventory Asset", accountType: "asset" },
  { code: "2000", name: "Liabilities", accountType: "liability" },
  { code: "2100", name: "Accounts Payable", accountType: "liability" },
  { code: "3000", name: "Equity", accountType: "equity" },
  { code: "3100", name: "Owner Equity", accountType: "equity" },
  { code: "4000", name: "Income", accountType: "income" },
  { code: "4100", name: "Sales Revenue", accountType: "income" },
  { code: "4200", name: "Other Income", accountType: "income" },
  { code: "5000", name: "Expenses", accountType: "expense" },
  { code: "5100", name: "Cost of Goods Sold", accountType: "expense" },
  { code: "5200", name: "Operating Expenses", accountType: "expense" },
  { code: "5300", name: "Purchase Returns", accountType: "expense" },
] as const;

/** Ensure permission catalog exists and Admin role has every permission (safe on every boot). */
export function ensurePermissions(db: Db): void {
  const existing = db.select().from(permissions).all();
  const byCode = new Map(existing.map((p) => [p.code, p]));

  for (const p of PERMISSION_CATALOG) {
    if (byCode.has(p.code)) continue;
    const id = randomUUID();
    db.insert(permissions)
      .values({
        id,
        code: p.code,
        module: p.module,
        description: p.description,
      })
      .run();
    byCode.set(p.code, {
      id,
      code: p.code,
      module: p.module,
      description: p.description,
    });
  }

  const adminRole = db.select().from(roles).where(eq(roles.name, "Admin")).get();
  if (!adminRole) return;

  // Ensure Super Admin role exists (same access as Admin + platform catalog)
  let superRole = db.select().from(roles).where(eq(roles.name, "Super Admin")).get();
  if (!superRole) {
    const id = randomUUID();
    db.insert(roles)
      .values({
        id,
        name: "Super Admin",
        description: "Vendor control: companies registry & full access",
        isSystem: true,
      })
      .run();
    superRole = db.select().from(roles).where(eq(roles.id, id)).get()!;
  }

  const linked = new Set(
    db
      .select({ permissionId: rolePermissions.permissionId })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, adminRole.id))
      .all()
      .map((r) => r.permissionId)
  );

  for (const p of byCode.values()) {
    if (linked.has(p.id)) continue;
    db.insert(rolePermissions)
      .values({
        id: randomUUID(),
        roleId: adminRole.id,
        permissionId: p.id,
      })
      .run();
  }

  // Mirror all permissions onto Super Admin
  const superLinked = new Set(
    db
      .select({ permissionId: rolePermissions.permissionId })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, superRole.id))
      .all()
      .map((r) => r.permissionId)
  );
  for (const p of byCode.values()) {
    if (superLinked.has(p.id)) continue;
    db.insert(rolePermissions)
      .values({
        id: randomUUID(),
        roleId: superRole.id,
        permissionId: p.id,
      })
      .run();
  }

  // Promote default admin user to Super Admin when that role exists
  const adminUser = db.select().from(users).where(eq(users.username, "admin")).get();
  if (adminUser && adminUser.roleId === adminRole.id && superRole) {
    db.update(users).set({ roleId: superRole.id, updatedAt: new Date().toISOString() }).where(eq(users.id, adminUser.id)).run();
  }
}

export async function seedDatabase(db: Db): Promise<void> {
  const existingAdmin = db.select().from(users).where(eq(users.username, "admin")).get();
  if (existingAdmin) {
    ensurePermissions(db);
    return;
  }

  const now = new Date().toISOString();

  const permissionRows = PERMISSION_CATALOG.map((p) => ({
    id: randomUUID(),
    code: p.code,
    module: p.module,
    description: p.description,
  }));
  db.insert(permissions).values(permissionRows).run();

  const adminRoleId = randomUUID();
  const cashierRoleId = randomUUID();
  const accountantRoleId = randomUUID();
  db.insert(roles)
    .values([
      {
        id: adminRoleId,
        name: "Admin",
        description: "Full system access",
        isSystem: true,
      },
      {
        id: cashierRoleId,
        name: "Cashier",
        description: "Sales and basic views",
        isSystem: true,
      },
      {
        id: accountantRoleId,
        name: "Accountant",
        description: "Ledgers, transactions, reports",
        isSystem: true,
      },
    ])
    .run();

  db.insert(rolePermissions)
    .values(
      permissionRows.map((p) => ({
        id: randomUUID(),
        roleId: adminRoleId,
        permissionId: p.id,
      }))
    )
    .run();

  const cashierCodes = new Set([
    "dashboard.view",
    "products.view",
    "inventory.view",
    "customers.view",
    "customers.manage",
    "sales.view",
    "sales.create",
    "sales.return",
    "transactions.view",
    "transactions.create",
    "ledgers.view",
    "reports.view",
  ]);
  db.insert(rolePermissions)
    .values(
      permissionRows
        .filter((p) => cashierCodes.has(p.code))
        .map((p) => ({
          id: randomUUID(),
          roleId: cashierRoleId,
          permissionId: p.id,
        }))
    )
    .run();

  const accountantCodes = new Set([
    "dashboard.view",
    "products.view",
    "inventory.view",
    "customers.view",
    "vendors.view",
    "sales.view",
    "purchases.view",
    "transactions.view",
    "transactions.create",
    "ledgers.view",
    "reports.view",
    "settings.manage",
  ]);
  db.insert(rolePermissions)
    .values(
      permissionRows
        .filter((p) => accountantCodes.has(p.code))
        .map((p) => ({
          id: randomUUID(),
          roleId: accountantRoleId,
          permissionId: p.id,
        }))
    )
    .run();

  const passwordHash = await bcrypt.hash("admin123", 10);
  db.insert(users)
    .values({
      id: randomUUID(),
      username: "admin",
      passwordHash,
      fullName: "System Administrator",
      roleId: adminRoleId,
      isActive: true,
    })
    .run();

  db.insert(units)
    .values([
      { id: randomUUID(), name: "Kilogram", shortName: "kg" },
      { id: randomUUID(), name: "Bag", shortName: "bag" },
      { id: randomUUID(), name: "Litre", shortName: "L" },
      { id: randomUUID(), name: "Piece", shortName: "Pc" },
      { id: randomUUID(), name: "Packet", shortName: "Pkt" },
      { id: randomUUID(), name: "Quintal", shortName: "Qtl" },
    ])
    .run();

  db.insert(categories)
    .values([
      { id: randomUUID(), name: "Seeds", description: "Crop seeds" },
      { id: randomUUID(), name: "Fertilizers", description: "Chemical & organic fertilizers" },
      { id: randomUUID(), name: "Pesticides", description: "Pesticides & fungicides" },
      { id: randomUUID(), name: "Feed", description: "Animal & poultry feed" },
      { id: randomUUID(), name: "Tools", description: "Farm tools & equipment" },
    ])
    .run();

  db.insert(taxes)
    .values([
      { id: randomUUID(), name: "No Tax", rate: 0, isInclusive: false },
      { id: randomUUID(), name: "GST 5%", rate: 5, isInclusive: false },
      { id: randomUUID(), name: "GST 18%", rate: 18, isInclusive: false },
    ])
    .run();

  db.insert(accounts)
    .values(
      DEFAULT_ACCOUNTS.map((a) => ({
        id: randomUUID(),
        code: a.code,
        name: a.name,
        accountType: a.accountType,
        isSystem: true,
        isActive: true,
        openingBalance: 0,
      }))
    )
    .run();

  db.insert(settings)
    .values([
      { id: randomUUID(), key: "shop_name", value: "Agri Soft Store", groupName: "shop" },
      { id: randomUUID(), key: "shop_phone", value: "", groupName: "shop" },
      { id: randomUUID(), key: "shop_address", value: "", groupName: "shop" },
      { id: randomUUID(), key: "currency_symbol", value: "Rs", groupName: "general" },
      { id: randomUUID(), key: "currency_code", value: "PKR", groupName: "general" },
      { id: randomUUID(), key: "tax_mode", value: "exclusive", groupName: "tax" },
      {
        id: randomUUID(),
        key: "receipt_footer",
        value: "Thank you for shopping with Agri Soft!",
        groupName: "receipt",
      },
      { id: randomUUID(), key: "seeded_at", value: now, groupName: "system" },
    ])
    .run();

  db.insert(documentCounters)
    .values([
      { id: randomUUID(), docType: "sale", prefix: "INV-", nextNumber: 1 },
      { id: randomUUID(), docType: "sale_return", prefix: "SR-", nextNumber: 1 },
      { id: randomUUID(), docType: "purchase", prefix: "PUR-", nextNumber: 1 },
      { id: randomUUID(), docType: "purchase_return", prefix: "PR-", nextNumber: 1 },
      { id: randomUUID(), docType: "payment", prefix: "PAY-", nextNumber: 1 },
      { id: randomUUID(), docType: "receipt", prefix: "REC-", nextNumber: 1 },
      { id: randomUUID(), docType: "journal", prefix: "JV-", nextNumber: 1 },
      { id: randomUUID(), docType: "expense", prefix: "EXP-", nextNumber: 1 },
      { id: randomUUID(), docType: "income", prefix: "INC-", nextNumber: 1 },
      { id: randomUUID(), docType: "customer", prefix: "CUS-", nextNumber: 1 },
      { id: randomUUID(), docType: "vendor", prefix: "VEN-", nextNumber: 1 },
      { id: randomUUID(), docType: "product", prefix: "SKU-", nextNumber: 1 },
    ])
    .run();
}
