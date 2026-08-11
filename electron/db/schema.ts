import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
};

// ─── Auth / RBAC ─────────────────────────────────────────────

export const roles = sqliteTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

export const permissions = sqliteTable("permissions", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  module: text("module").notNull(),
  description: text("description"),
});

export const rolePermissions = sqliteTable(
  "role_permissions",
  {
    id: text("id").primaryKey(),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: text("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("role_perm_unique").on(t.roleId, t.permissionId)]
);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  roleId: text("role_id")
    .notNull()
    .references(() => roles.id),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  lastLoginAt: text("last_login_at"),
  ...timestamps,
});

// ─── Settings ────────────────────────────────────────────────

export const settings = sqliteTable("settings", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value"),
  groupName: text("group_name").notNull().default("general"),
  ...timestamps,
});

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id),
    action: text("action").notNull(),
    module: text("module").notNull(),
    entityId: text("entity_id"),
    details: text("details"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("audit_module_idx").on(t.module), index("audit_created_idx").on(t.createdAt)]
);

// ─── Masters: Units / Categories / Products ──────────────────

export const units = sqliteTable("units", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  shortName: text("short_name").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  parentId: text("parent_id"),
  description: text("description"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    sku: text("sku").notNull().unique(),
    barcode: text("barcode"),
    name: text("name").notNull(),
    description: text("description"),
    categoryId: text("category_id").references(() => categories.id),
    unitId: text("unit_id").references(() => units.id),
    brand: text("brand"),
    gender: text("gender"), // optional label (agri: unused / custom)
    season: text("season"), // optional season / crop cycle
    costPrice: real("cost_price").notNull().default(0),
    salePrice: real("sale_price").notNull().default(0),
    wholesalePrice: real("wholesale_price").default(0),
    taxId: text("tax_id"),
    reorderLevel: real("reorder_level").notNull().default(0),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("products_name_idx").on(t.name),
    index("products_barcode_idx").on(t.barcode),
  ]
);

/** Shoe variants: size + color (each has own stock & optional SKU) */
export const productVariants = sqliteTable(
  "product_variants",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: text("sku").notNull().unique(),
    barcode: text("barcode"),
    size: text("size").notNull(),
    color: text("color").notNull(),
    costPrice: real("cost_price"),
    salePrice: real("sale_price"),
    stockQty: real("stock_qty").notNull().default(0),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("variant_unique").on(t.productId, t.size, t.color),
    index("variant_product_idx").on(t.productId),
  ]
);

export const stockMovements = sqliteTable(
  "stock_movements",
  {
    id: text("id").primaryKey(),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariants.id),
    movementType: text("movement_type").notNull(), // in | out | adjust
    quantity: real("quantity").notNull(),
    referenceType: text("reference_type"), // sale | purchase | sale_return | purchase_return | adjustment
    referenceId: text("reference_id"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("stock_variant_idx").on(t.variantId)]
);

// ─── Parties ─────────────────────────────────────────────────

export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    city: text("city"),
    openingBalance: real("opening_balance").notNull().default(0),
    balanceType: text("balance_type").notNull().default("debit"), // debit = customer owes
    creditLimit: real("credit_limit").default(0),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (t) => [index("customers_name_idx").on(t.name), index("customers_phone_idx").on(t.phone)]
);

export const vendors = sqliteTable(
  "vendors",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    city: text("city"),
    openingBalance: real("opening_balance").notNull().default(0),
    balanceType: text("balance_type").notNull().default("credit"), // credit = we owe vendor
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (t) => [index("vendors_name_idx").on(t.name)]
);

// ─── Taxes / Discounts / Additions ───────────────────────────

export const taxes = sqliteTable("taxes", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  rate: real("rate").notNull().default(0), // percent
  isInclusive: integer("is_inclusive", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const discounts = sqliteTable("discounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  type: text("type").notNull().default("percent"), // percent | fixed
  value: real("value").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const additions = sqliteTable("additions", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  type: text("type").notNull().default("fixed"), // percent | fixed
  value: real("value").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

// ─── Chart of Accounts + Ledger ──────────────────────────────

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    accountType: text("account_type").notNull(), // asset | liability | equity | income | expense
    parentId: text("parent_id"),
    isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    openingBalance: real("opening_balance").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("accounts_type_idx").on(t.accountType)]
);

/** Header for any financial voucher (sale, purchase, pay, receive, journal, expense, income) */
export const vouchers = sqliteTable(
  "vouchers",
  {
    id: text("id").primaryKey(),
    voucherNo: text("voucher_no").notNull().unique(),
    voucherType: text("voucher_type").notNull(), // sale | sale_return | purchase | purchase_return | payment | receipt | journal | expense | income
    voucherDate: text("voucher_date").notNull(),
    partyType: text("party_type"), // customer | vendor | none
    partyId: text("party_id"),
    accountId: text("account_id").references(() => accounts.id), // cash/bank for pay/receive
    referenceNo: text("reference_no"),
    notes: text("notes"),
    subtotal: real("subtotal").notNull().default(0),
    discountAmount: real("discount_amount").notNull().default(0),
    additionAmount: real("addition_amount").notNull().default(0),
    taxAmount: real("tax_amount").notNull().default(0),
    grandTotal: real("grand_total").notNull().default(0),
    paidAmount: real("paid_amount").notNull().default(0),
    status: text("status").notNull().default("posted"), // draft | posted | cancelled
    createdBy: text("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("vouchers_type_idx").on(t.voucherType),
    index("vouchers_date_idx").on(t.voucherDate),
    index("vouchers_party_idx").on(t.partyType, t.partyId),
  ]
);

/** Double-entry lines */
export const voucherEntries = sqliteTable(
  "voucher_entries",
  {
    id: text("id").primaryKey(),
    voucherId: text("voucher_id")
      .notNull()
      .references(() => vouchers.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    debit: real("debit").notNull().default(0),
    credit: real("credit").notNull().default(0),
    narration: text("narration"),
    lineOrder: integer("line_order").notNull().default(0),
  },
  (t) => [index("voucher_entries_voucher_idx").on(t.voucherId)]
);

// ─── Sales ───────────────────────────────────────────────────

export const sales = sqliteTable(
  "sales",
  {
    id: text("id").primaryKey(),
    voucherId: text("voucher_id")
      .notNull()
      .references(() => vouchers.id),
    invoiceNo: text("invoice_no").notNull().unique(),
    invoiceDate: text("invoice_date").notNull(),
    customerId: text("customer_id").references(() => customers.id),
    paymentMode: text("payment_mode").notNull().default("cash"), // cash | credit | bank | split
    subtotal: real("subtotal").notNull().default(0),
    discountAmount: real("discount_amount").notNull().default(0),
    additionAmount: real("addition_amount").notNull().default(0),
    taxAmount: real("tax_amount").notNull().default(0),
    grandTotal: real("grand_total").notNull().default(0),
    paidAmount: real("paid_amount").notNull().default(0),
    notes: text("notes"),
    status: text("status").notNull().default("completed"), // completed | returned | cancelled | deleted
    createdBy: text("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("sales_date_idx").on(t.invoiceDate), index("sales_customer_idx").on(t.customerId)]
);

export const saleItems = sqliteTable("sale_items", {
  id: text("id").primaryKey(),
  saleId: text("sale_id")
    .notNull()
    .references(() => sales.id, { onDelete: "cascade" }),
  variantId: text("variant_id")
    .notNull()
    .references(() => productVariants.id),
  productName: text("product_name").notNull(),
  size: text("size"),
  color: text("color"),
  quantity: real("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
  costPrice: real("cost_price").notNull().default(0),
  discountAmount: real("discount_amount").notNull().default(0),
  taxAmount: real("tax_amount").notNull().default(0),
  lineTotal: real("line_total").notNull(),
  lineOrder: integer("line_order").notNull().default(0),
});

export const saleReturns = sqliteTable("sale_returns", {
  id: text("id").primaryKey(),
  voucherId: text("voucher_id")
    .notNull()
    .references(() => vouchers.id),
  returnNo: text("return_no").notNull().unique(),
  returnDate: text("return_date").notNull(),
  saleId: text("sale_id").references(() => sales.id),
  customerId: text("customer_id").references(() => customers.id),
  subtotal: real("subtotal").notNull().default(0),
  taxAmount: real("tax_amount").notNull().default(0),
  grandTotal: real("grand_total").notNull().default(0),
  notes: text("notes"),
  createdBy: text("created_by").references(() => users.id),
  ...timestamps,
});

export const saleReturnItems = sqliteTable("sale_return_items", {
  id: text("id").primaryKey(),
  saleReturnId: text("sale_return_id")
    .notNull()
    .references(() => saleReturns.id, { onDelete: "cascade" }),
  variantId: text("variant_id")
    .notNull()
    .references(() => productVariants.id),
  quantity: real("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
  lineTotal: real("line_total").notNull(),
});

// ─── Purchases ───────────────────────────────────────────────

export const purchases = sqliteTable(
  "purchases",
  {
    id: text("id").primaryKey(),
    voucherId: text("voucher_id")
      .notNull()
      .references(() => vouchers.id),
    invoiceNo: text("invoice_no").notNull().unique(),
    invoiceDate: text("invoice_date").notNull(),
    vendorId: text("vendor_id").references(() => vendors.id),
    paymentMode: text("payment_mode").notNull().default("credit"),
    subtotal: real("subtotal").notNull().default(0),
    discountAmount: real("discount_amount").notNull().default(0),
    additionAmount: real("addition_amount").notNull().default(0),
    taxAmount: real("tax_amount").notNull().default(0),
    grandTotal: real("grand_total").notNull().default(0),
    paidAmount: real("paid_amount").notNull().default(0),
    notes: text("notes"),
    status: text("status").notNull().default("completed"), // completed | cancelled | deleted
    createdBy: text("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("purchases_date_idx").on(t.invoiceDate), index("purchases_vendor_idx").on(t.vendorId)]
);

export const purchaseItems = sqliteTable("purchase_items", {
  id: text("id").primaryKey(),
  purchaseId: text("purchase_id")
    .notNull()
    .references(() => purchases.id, { onDelete: "cascade" }),
  variantId: text("variant_id")
    .notNull()
    .references(() => productVariants.id),
  productName: text("product_name").notNull(),
  size: text("size"),
  color: text("color"),
  quantity: real("quantity").notNull(),
  unitCost: real("unit_cost").notNull(),
  discountAmount: real("discount_amount").notNull().default(0),
  taxAmount: real("tax_amount").notNull().default(0),
  lineTotal: real("line_total").notNull(),
  lineOrder: integer("line_order").notNull().default(0),
});

export const purchaseReturns = sqliteTable("purchase_returns", {
  id: text("id").primaryKey(),
  voucherId: text("voucher_id")
    .notNull()
    .references(() => vouchers.id),
  returnNo: text("return_no").notNull().unique(),
  returnDate: text("return_date").notNull(),
  purchaseId: text("purchase_id").references(() => purchases.id),
  vendorId: text("vendor_id").references(() => vendors.id),
  subtotal: real("subtotal").notNull().default(0),
  taxAmount: real("tax_amount").notNull().default(0),
  grandTotal: real("grand_total").notNull().default(0),
  notes: text("notes"),
  createdBy: text("created_by").references(() => users.id),
  ...timestamps,
});

export const purchaseReturnItems = sqliteTable("purchase_return_items", {
  id: text("id").primaryKey(),
  purchaseReturnId: text("purchase_return_id")
    .notNull()
    .references(() => purchaseReturns.id, { onDelete: "cascade" }),
  variantId: text("variant_id")
    .notNull()
    .references(() => productVariants.id),
  quantity: real("quantity").notNull(),
  unitCost: real("unit_cost").notNull(),
  lineTotal: real("line_total").notNull(),
});

// ─── Document counters ───────────────────────────────────────

export const documentCounters = sqliteTable("document_counters", {
  id: text("id").primaryKey(),
  docType: text("doc_type").notNull().unique(),
  prefix: text("prefix").notNull(),
  nextNumber: integer("next_number").notNull().default(1),
  padLength: integer("pad_length").notNull().default(5),
  ...timestamps,
});

/** Local registry of client companies using Agri Soft Pro (vendor / Super Admin view). */
export const clientCompanies = sqliteTable(
  "client_companies",
  {
    id: text("id").primaryKey(),
    companyName: text("company_name").notNull(),
    area: text("area").notNull(),
    joinedAt: text("joined_at").notNull(),
    notes: text("notes"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (t) => [index("client_companies_area_idx").on(t.area), index("client_companies_joined_idx").on(t.joinedAt)]
);

/** Pro licenses activated by Super Admin (Install ID + plan). */
export const licenses = sqliteTable(
  "licenses",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    installId: text("install_id").notNull(),
    plan: text("plan").notNull(), // monthly | yearly | forever
    activatedAt: text("activated_at").notNull(),
    expiresAt: text("expires_at"), // null = forever
    notes: text("notes"),
    phone: text("phone"),
    ...timestamps,
  },
  (t) => [index("licenses_install_idx").on(t.installId)]
);
