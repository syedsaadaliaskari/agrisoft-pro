import { and, eq } from "drizzle-orm";
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
    code: "license.manage",
    module: "license",
    description: "License — activate Monthly / Yearly / Forever (Setup → License)",
  },
  {
    code: "license.view",
    module: "license",
    description: "Activated list — see companies activated for Pro",
  },
  {
    code: "platform.view",
    module: "platform",
    description: "Client companies & demand by area on Dashboard",
  },
] as const;

/** Permissions reserved for Super Admin unless manually granted via Users & RBAC. */
export const SUPER_ADMIN_ONLY_PERMISSIONS = new Set([
  "license.manage",
  "license.view",
  "platform.view",
]);

const DEFAULT_ACCOUNTS = [
  { code: "1000", name: "Assets", accountType: "asset" },
  { code: "1100", name: "Cash", accountType: "asset" },
  { code: "1200", name: "Bank", accountType: "asset" },
  { code: "1300", name: "Receivables", accountType: "asset" },
  { code: "1400", name: "Inventory", accountType: "asset" },
  { code: "2000", name: "Liabilities", accountType: "liability" },
  { code: "2100", name: "Payables", accountType: "liability" },
  { code: "3000", name: "Equity", accountType: "equity" },
  { code: "3100", name: "Owner Equity", accountType: "equity" },
  { code: "3200", name: "Owner Draw", accountType: "equity" },
  { code: "4000", name: "Income", accountType: "income" },
  { code: "4100", name: "Sales", accountType: "income" },
  { code: "4200", name: "Other Income", accountType: "income" },
  { code: "5000", name: "Expenses", accountType: "expense" },
  { code: "5100", name: "Cost of Goods", accountType: "expense" },
  { code: "5200", name: "Operating Expenses", accountType: "expense" },
  { code: "5300", name: "Purchase Returns", accountType: "expense" },
] as const;

function settingExists(db: Db, key: string): boolean {
  return !!db.select().from(settings).where(eq(settings.key, key)).get();
}

function upsertSystemSetting(db: Db, key: string, value: string) {
  const existing = db.select().from(settings).where(eq(settings.key, key)).get();
  const now = new Date().toISOString();
  if (existing) {
    db.update(settings).set({ value, updatedAt: now }).where(eq(settings.id, existing.id)).run();
  } else {
    db.insert(settings)
      .values({ id: randomUUID(), key, value, groupName: "system", createdAt: now, updatedAt: now })
      .run();
  }
}

function grantMissingPermissions(
  db: Db,
  roleId: string,
  permRows: { id: string; code: string }[],
  allowCodes?: Set<string>
) {
  const linked = new Set(
    db
      .select({ permissionId: rolePermissions.permissionId })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId))
      .all()
      .map((r) => r.permissionId)
  );

  for (const p of permRows) {
    if (allowCodes && !allowCodes.has(p.code)) continue;
    if (linked.has(p.id)) continue;
    db.insert(rolePermissions)
      .values({
        id: randomUUID(),
        roleId,
        permissionId: p.id,
      })
      .run();
  }
}

/**
 * Ensure permission catalog exists.
 * Super Admin always gets every permission.
 * Admin gets every permission except Super-Admin-only ones (License / Activated list).
 * Super Admin can still tick those for other roles manually in Users & RBAC.
 */
export function ensurePermissions(db: Db): void {
  const existing = db.select().from(permissions).all();
  const byCode = new Map(existing.map((p) => [p.code, p]));

  for (const p of PERMISSION_CATALOG) {
    if (byCode.has(p.code)) {
      // Keep descriptions in sync with catalog
      const row = byCode.get(p.code)!;
      if (row.description !== p.description || row.module !== p.module) {
        db.update(permissions)
          .set({ description: p.description, module: p.module })
          .where(eq(permissions.id, row.id))
          .run();
        byCode.set(p.code, { ...row, description: p.description, module: p.module });
      }
      continue;
    }
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

  const allPermRows = [...byCode.values()];
  const adminAllow = new Set(
    allPermRows.filter((p) => !SUPER_ADMIN_ONLY_PERMISSIONS.has(p.code)).map((p) => p.code)
  );

  const adminRole = db.select().from(roles).where(eq(roles.name, "Admin")).get();
  if (!adminRole) return;

  // Ensure Super Admin role exists (full access including License / Activated list)
  let superRole = db.select().from(roles).where(eq(roles.name, "Super Admin")).get();
  if (!superRole) {
    const id = randomUUID();
    db.insert(roles)
      .values({
        id,
        name: "Super Admin",
        description: "Full access including License & Activated list",
        isSystem: true,
      })
      .run();
    superRole = db.select().from(roles).where(eq(roles.id, id)).get()!;
  }

  // Admin: shop ops defaults — no License / Activated unless Super Admin ticks them later
  grantMissingPermissions(db, adminRole.id, allPermRows, adminAllow);

  // Super Admin: always everything
  grantMissingPermissions(db, superRole.id, allPermRows);

  // Migrate legacy platform.view → license.manage + license.view
  const legacyPlatform = byCode.get("platform.view");
  const licenseManage = byCode.get("license.manage");
  const licenseView = byCode.get("license.view");
  if (legacyPlatform && licenseManage && licenseView) {
    const rolesWithLegacy = db
      .select({ roleId: rolePermissions.roleId })
      .from(rolePermissions)
      .where(eq(rolePermissions.permissionId, legacyPlatform.id))
      .all();
    for (const { roleId } of rolesWithLegacy) {
      grantMissingPermissions(db, roleId, [licenseManage, licenseView]);
    }
  }

  // One-time: strip Super-Admin-only license/platform perms from non–Super Admin roles
  if (!settingExists(db, "rbac_license_perms_v3")) {
    const superOnlyIds = allPermRows
      .filter((p) => SUPER_ADMIN_ONLY_PERMISSIONS.has(p.code))
      .map((p) => p.id);
    const otherRoles = db
      .select()
      .from(roles)
      .all()
      .filter((r) => r.name !== "Super Admin");
    for (const role of otherRoles) {
      for (const permissionId of superOnlyIds) {
        db.delete(rolePermissions)
          .where(
            and(eq(rolePermissions.roleId, role.id), eq(rolePermissions.permissionId, permissionId))
          )
          .run();
      }
    }
    upsertSystemSetting(db, "rbac_license_perms_v3", new Date().toISOString());
  }

  // Re-assert Super Admin full access after strip migration (License + Activated + Companies)
  grantMissingPermissions(db, superRole.id, allPermRows);

  // Customers must NOT be Super Admin by default (license is vendor-controlled).
  // Only a machine with vendor_unlocked=1 keeps Super Admin users.
  const vendorUnlocked =
    db.select().from(settings).where(eq(settings.key, "vendor_unlocked")).get()?.value === "1";
  if (!vendorUnlocked) {
    const saUsers = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.roleId, superRole.id))
      .all();
    for (const u of saUsers) {
      db.update(users)
        .set({ roleId: adminRole.id, updatedAt: new Date().toISOString() })
        .where(eq(users.id, u.id))
        .run();
    }
  }

  // Clear legacy forced password-change flag on existing installs
  upsertSystemSetting(db, "must_change_password", "0");

  ensureSimpleAccountNames(db);
  ensureOwnerDrawSupport(db);
}

/** Insert Owner Draw equity account + document counter on existing installs. */
export function ensureOwnerDrawSupport(db: Db): void {
  const now = new Date().toISOString();
  const draw = db.select().from(accounts).where(eq(accounts.code, "3200")).get();
  if (!draw) {
    db.insert(accounts)
      .values({
        id: randomUUID(),
        code: "3200",
        name: "Owner Draw",
        accountType: "equity",
        isSystem: true,
        isActive: true,
        openingBalance: 0,
      })
      .run();
  } else if (draw.name !== "Owner Draw") {
    db.update(accounts)
      .set({ name: "Owner Draw", updatedAt: now })
      .where(eq(accounts.id, draw.id))
      .run();
  }

  const counter = db
    .select()
    .from(documentCounters)
    .where(eq(documentCounters.docType, "owner_draw"))
    .get();
  if (!counter) {
    db.insert(documentCounters)
      .values({
        id: randomUUID(),
        docType: "owner_draw",
        prefix: "#",
        nextNumber: 1,
      })
      .run();
  }
}

/** Rename default chart accounts to short plain names (Cash, Bank, …). */
export function ensureSimpleAccountNames(db: Db): void {
  if (settingExists(db, "simple_account_names_v1")) return;
  for (const a of DEFAULT_ACCOUNTS) {
    const row = db.select().from(accounts).where(eq(accounts.code, a.code)).get();
    if (row && row.name !== a.name) {
      db.update(accounts)
        .set({ name: a.name, updatedAt: new Date().toISOString() })
        .where(eq(accounts.id, row.id))
        .run();
    }
  }
  upsertSystemSetting(db, "simple_account_names_v1", new Date().toISOString());
}

export async function seedDatabase(
  db: Db,
  _options?: { production?: boolean }
): Promise<void> {
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
        description: "Shop admin — all ops except License / Activated (unless granted)",
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
      permissionRows
        .filter((p) => !SUPER_ADMIN_ONLY_PERMISSIONS.has(p.code))
        .map((p) => ({
          id: randomUUID(),
          roleId: adminRoleId,
          permissionId: p.id,
        }))
    )
    .run();

  // Super Admin is created by ensurePermissions() after first login path;
  // also create it here on fresh seed so License stays Super-Admin-only.
  const superAdminRoleId = randomUUID();
  db.insert(roles)
    .values({
      id: superAdminRoleId,
      name: "Super Admin",
      description: "Full access including License & Activated list",
      isSystem: true,
    })
    .run();
  db.insert(rolePermissions)
    .values(
      permissionRows.map((p) => ({
        id: randomUUID(),
        roleId: superAdminRoleId,
        permissionId: p.id,
      }))
    )
    .run();
  upsertSystemSetting(db, "rbac_license_perms_v3", new Date().toISOString());
  // Never force password change — vendor gives the password; users keep it.
  upsertSystemSetting(db, "must_change_password", "0");

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
      fullName: "Shop Administrator",
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
      { id: randomUUID(), docType: "sale", prefix: "#", nextNumber: 1 },
      { id: randomUUID(), docType: "sale_return", prefix: "#", nextNumber: 1 },
      { id: randomUUID(), docType: "purchase", prefix: "#", nextNumber: 1 },
      { id: randomUUID(), docType: "purchase_return", prefix: "#", nextNumber: 1 },
      { id: randomUUID(), docType: "payment", prefix: "#", nextNumber: 1 },
      { id: randomUUID(), docType: "receipt", prefix: "#", nextNumber: 1 },
      { id: randomUUID(), docType: "journal", prefix: "#", nextNumber: 1 },
      { id: randomUUID(), docType: "expense", prefix: "#", nextNumber: 1 },
      { id: randomUUID(), docType: "income", prefix: "#", nextNumber: 1 },
      { id: randomUUID(), docType: "owner_draw", prefix: "#", nextNumber: 1 },
      { id: randomUUID(), docType: "customer", prefix: "#", nextNumber: 1 },
      { id: randomUUID(), docType: "vendor", prefix: "#", nextNumber: 1 },
      { id: randomUUID(), docType: "product", prefix: "#", nextNumber: 1 },
    ])
    .run();
}
