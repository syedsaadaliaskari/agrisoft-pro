/** Shared IPC channel names between Electron main and renderer */
export const IPC = {
  PING: "app:ping",
  GET_APP_INFO: "app:getInfo",
  AUTH_LOGIN: "auth:login",
  AUTH_LOGOUT: "auth:logout",
  AUTH_CURRENT_USER: "auth:currentUser",
  AUTH_CHANGE_PASSWORD: "auth:changePassword",
  DB_STATS: "db:stats",

  // Document numbers
  DOCS_NEXT_NUMBER: "docs:nextNumber",

  // Units
  UNITS_LIST: "units:list",
  UNITS_CREATE: "units:create",
  UNITS_UPDATE: "units:update",
  UNITS_DELETE: "units:delete",

  // Categories
  CATEGORIES_LIST: "categories:list",
  CATEGORIES_CREATE: "categories:create",
  CATEGORIES_UPDATE: "categories:update",
  CATEGORIES_DELETE: "categories:delete",

  // Taxes
  TAXES_LIST: "taxes:list",
  TAXES_CREATE: "taxes:create",
  TAXES_UPDATE: "taxes:update",
  TAXES_DELETE: "taxes:delete",

  // Discounts
  DISCOUNTS_LIST: "discounts:list",
  DISCOUNTS_CREATE: "discounts:create",
  DISCOUNTS_UPDATE: "discounts:update",
  DISCOUNTS_DELETE: "discounts:delete",

  // Additions
  ADDITIONS_LIST: "additions:list",
  ADDITIONS_CREATE: "additions:create",
  ADDITIONS_UPDATE: "additions:update",
  ADDITIONS_DELETE: "additions:delete",

  // Products
  PRODUCTS_LIST: "products:list",
  PRODUCTS_GET: "products:get",
  PRODUCTS_CREATE: "products:create",
  PRODUCTS_UPDATE: "products:update",
  PRODUCTS_DELETE: "products:delete",

  // Variants
  VARIANTS_LIST: "variants:list",
  VARIANTS_CREATE: "variants:create",
  VARIANTS_UPDATE: "variants:update",
  VARIANTS_DELETE: "variants:delete",

  // Inventory
  INVENTORY_LIST: "inventory:list",
  INVENTORY_ADJUST: "inventory:adjust",
  INVENTORY_FIND_BARCODE: "inventory:findByBarcode",

  // Customers
  CUSTOMERS_LIST: "customers:list",
  CUSTOMERS_CREATE: "customers:create",
  CUSTOMERS_UPDATE: "customers:update",
  CUSTOMERS_DELETE: "customers:delete",

  // Vendors
  VENDORS_LIST: "vendors:list",
  VENDORS_CREATE: "vendors:create",
  VENDORS_UPDATE: "vendors:update",
  VENDORS_DELETE: "vendors:delete",

  PURCHASES_LIST: "purchases:list",
  PURCHASES_GET: "purchases:get",
  PURCHASES_LIST_BY_VENDOR: "purchases:listByVendor",
  PURCHASES_CREATE: "purchases:create",
  PURCHASES_UPDATE: "purchases:update",
  PURCHASES_DELETE: "purchases:delete",
  PURCHASE_RETURNS_LIST: "purchaseReturns:list",
  PURCHASE_RETURNS_GET: "purchaseReturns:get",
  PURCHASE_RETURNS_CREATE: "purchaseReturns:create",

  // Sales
  SALES_LIST: "sales:list",
  SALES_GET: "sales:get",
  SALES_LIST_BY_CUSTOMER: "sales:listByCustomer",
  SALES_CREATE: "sales:create",
  SALES_UPDATE: "sales:update",
  SALES_DELETE: "sales:delete",
  SALE_RETURNS_LIST: "saleReturns:list",
  SALE_RETURNS_GET: "saleReturns:get",
  SALE_RETURNS_CREATE: "saleReturns:create",

  // Ledger / vouchers
  ACCOUNTS_LIST: "accounts:list",
  ACCOUNTS_GET: "accounts:get",
  VOUCHERS_POST: "vouchers:post",
  VOUCHERS_GET: "vouchers:get",
  VOUCHERS_LIST: "vouchers:list",
  VOUCHERS_CANCEL: "vouchers:cancel",
  LEDGER_ACCOUNT: "ledger:account",
  LEDGER_PARTY: "ledger:party",

  // Transactions (convenience posters)
  TX_RECEIVE: "transactions:receive",
  TX_RECEIVE_UPDATE: "transactions:receiveUpdate",
  TX_PAY: "transactions:pay",
  TX_PAY_UPDATE: "transactions:payUpdate",
  TX_EXPENSE: "transactions:expense",
  TX_EXPENSE_UPDATE: "transactions:expenseUpdate",
  TX_INCOME: "transactions:income",
  TX_INCOME_UPDATE: "transactions:incomeUpdate",
  VOUCHERS_UPDATE: "vouchers:update",
  // Dashboard / reports
  DASHBOARD_SUMMARY: "dashboard:summary",
  REPORTS_SALES: "reports:sales",
  REPORTS_PURCHASES: "reports:purchases",
  REPORTS_PROFIT: "reports:profit",
  REPORTS_STOCK: "reports:stock",
  REPORTS_TAX: "reports:tax",
  REPORTS_DELETED: "reports:deleted",

  // Platform — local client companies registry (software vendor view)
  COMPANIES_LIST: "companies:list",
  COMPANIES_CREATE: "companies:create",
  COMPANIES_UPDATE: "companies:update",
  COMPANIES_DELETE: "companies:delete",
  COMPANIES_DEMAND: "companies:demand",

  // Settings / users / audit
  SETTINGS_GET_ALL: "settings:getAll",
  SETTINGS_UPDATE: "settings:update",
  SETTINGS_SET_LOGO: "settings:setLogo",
  SETTINGS_CLEAR_LOGO: "settings:clearLogo",
  USERS_LIST: "users:list",
  USERS_CREATE: "users:create",
  USERS_UPDATE: "users:update",
  USERS_SET_PASSWORD: "users:setPassword",
  ROLES_LIST: "roles:list",
  PERMISSIONS_LIST: "permissions:list",
  ROLES_SET_PERMISSIONS: "roles:setPermissions",
  AUDIT_LIST: "audit:list",

  // App utilities
  APP_PRINT_HTML: "app:printHtml",
  APP_SAVE_FILE: "app:saveFile",

  // Backup / restore
  BACKUP_STATUS: "backup:status",
  BACKUP_RUN_MANUAL: "backup:runManual",
  BACKUP_RUN_AUTO: "backup:runAuto",
  BACKUP_RESTORE: "backup:restore",
  BACKUP_PICK_FILE: "backup:pickFile",
  BACKUP_OPEN_FOLDER: "backup:openFolder",

  LICENSE_STATUS: "license:status",
  LICENSE_LIST: "license:list",
  LICENSE_CREATE: "license:create",
  LICENSE_DELETE: "license:delete",
  LICENSE_EXPIRE_TRIAL: "license:expireTrial",
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

export type SessionUser = {
  id: string;
  username: string;
  fullName: string;
  roleId: string;
  roleName: string;
  permissions: string[];
  /** Packaged install: user must change default password before using the app */
  mustChangePassword?: boolean;
};

export type AppInfo = {
  name: string;
  version: string;
  dbPath: string;
  isDev: boolean;
};

export type DbStats = {
  products: number;
  customers: number;
  vendors: number;
  sales: number;
  purchases: number;
  users: number;
};

export type LoginResult =
  | { ok: true; user: SessionUser }
  | { ok: false; error: string };

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type DocType =
  | "sale"
  | "sale_return"
  | "purchase"
  | "purchase_return"
  | "payment"
  | "receipt"
  | "journal"
  | "expense"
  | "income"
  | "customer"
  | "vendor"
  | "product";

export type Unit = {
  id: string;
  name: string;
  shortName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UnitInput = {
  name: string;
  shortName: string;
  isActive?: boolean;
};

export type Category = {
  id: string;
  name: string;
  parentId: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CategoryInput = {
  name: string;
  parentId?: string | null;
  description?: string | null;
  isActive?: boolean;
};

export type Tax = {
  id: string;
  name: string;
  rate: number;
  isInclusive: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TaxInput = {
  name: string;
  rate: number;
  isInclusive?: boolean;
  isActive?: boolean;
};

export type AmountType = "percent" | "fixed";

export type Discount = {
  id: string;
  name: string;
  type: AmountType;
  value: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DiscountInput = {
  name: string;
  type: AmountType;
  value: number;
  isActive?: boolean;
};

export type Addition = {
  id: string;
  name: string;
  type: AmountType;
  value: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdditionInput = {
  name: string;
  type: AmountType;
  value: number;
  isActive?: boolean;
};

export type ProductGender = "men" | "women" | "kids" | "unisex" | "";

export type Product = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  categoryId: string | null;
  unitId: string | null;
  brand: string | null;
  gender: string | null;
  season: string | null;
  costPrice: number;
  salePrice: number;
  wholesalePrice: number | null;
  taxId: string | null;
  reorderLevel: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  categoryName?: string | null;
  unitName?: string | null;
  taxName?: string | null;
  variantCount?: number;
  totalStock?: number;
};

export type ProductInput = {
  sku?: string;
  barcode?: string | null;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  unitId?: string | null;
  brand?: string | null;
  gender?: string | null;
  season?: string | null;
  costPrice: number;
  salePrice: number;
  wholesalePrice?: number | null;
  taxId?: string | null;
  reorderLevel?: number;
  isActive?: boolean;
};

export type ProductVariant = {
  id: string;
  productId: string;
  sku: string;
  barcode: string | null;
  size: string;
  color: string;
  costPrice: number | null;
  salePrice: number | null;
  stockQty: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductVariantInput = {
  size: string;
  color: string;
  sku?: string;
  barcode?: string | null;
  costPrice?: number | null;
  salePrice?: number | null;
  /** Initial stock on create only */
  stockQty?: number;
  isActive?: boolean;
};

export type InventoryRow = {
  variantId: string;
  productId: string;
  productName: string;
  productSku: string;
  variantSku: string;
  barcode: string | null;
  productBarcode: string | null;
  size: string;
  color: string;
  stockQty: number;
  costPrice: number;
  salePrice: number;
  reorderLevel: number;
  isLowStock: boolean;
  isActive: boolean;
};

export type StockAdjustInput = {
  variantId: string;
  newQty: number;
  notes?: string;
};

export type BalanceType = "debit" | "credit";

export type Customer = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  openingBalance: number;
  balanceType: BalanceType;
  creditLimit: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CustomerInput = {
  code?: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  openingBalance?: number;
  balanceType?: BalanceType;
  creditLimit?: number;
  isActive?: boolean;
};

export type Vendor = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  openingBalance: number;
  balanceType: BalanceType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type VendorInput = {
  code?: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  openingBalance?: number;
  balanceType?: BalanceType;
  isActive?: boolean;
};

// ─── Ledger / Chart of Accounts ─────────────────────────────

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

export type Account = {
  id: string;
  code: string;
  name: string;
  accountType: AccountType;
  parentId: string | null;
  isSystem: boolean;
  isActive: boolean;
  openingBalance: number;
  createdAt: string;
  updatedAt: string;
};

export type AccountListFilter = {
  accountType?: AccountType;
  /** Only cash/bank style accounts (codes 1100, 1200 by default) */
  cashBankOnly?: boolean;
  activeOnly?: boolean;
};

export type PartyType = "customer" | "vendor";

export type PartyOption = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  partyType: PartyType;
  openingBalance: number;
  balanceType: BalanceType;
};

export type VoucherType =
  | "sale"
  | "sale_return"
  | "purchase"
  | "purchase_return"
  | "payment"
  | "receipt"
  | "journal"
  | "expense"
  | "income";

export type VoucherStatus = "draft" | "posted" | "cancelled";

export type VoucherEntryInput = {
  accountId: string;
  debit: number;
  credit: number;
  narration?: string | null;
};

export type PostVoucherInput = {
  voucherType: VoucherType;
  voucherDate: string; // YYYY-MM-DD
  partyType?: PartyType | null;
  partyId?: string | null;
  /** Cash/Bank (or other) account on the voucher header */
  accountId?: string | null;
  referenceNo?: string | null;
  notes?: string | null;
  subtotal?: number;
  discountAmount?: number;
  additionAmount?: number;
  taxAmount?: number;
  grandTotal?: number;
  paidAmount?: number;
  entries: VoucherEntryInput[];
};

export type VoucherEntry = {
  id: string;
  voucherId: string;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  debit: number;
  credit: number;
  narration: string | null;
  lineOrder: number;
};

export type Voucher = {
  id: string;
  voucherNo: string;
  voucherType: VoucherType;
  voucherDate: string;
  partyType: PartyType | null;
  partyId: string | null;
  partyName?: string | null;
  accountId: string | null;
  accountName?: string | null;
  referenceNo: string | null;
  notes: string | null;
  subtotal: number;
  discountAmount: number;
  additionAmount: number;
  taxAmount: number;
  grandTotal: number;
  paidAmount: number;
  status: VoucherStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  entries?: VoucherEntry[];
};

export type LedgerLine = {
  date: string;
  voucherId: string;
  voucherNo: string;
  voucherType: VoucherType;
  narration: string | null;
  debit: number;
  credit: number;
  balance: number;
};

export type AccountLedger = {
  account: Account;
  fromDate: string | null;
  toDate: string | null;
  openingBalance: number;
  openingSide: BalanceType;
  lines: LedgerLine[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  closingSide: BalanceType;
};

export type PartyLedger = {
  partyType: PartyType;
  partyId: string;
  partyCode: string;
  partyName: string;
  fromDate: string | null;
  toDate: string | null;
  openingBalance: number;
  openingSide: BalanceType;
  lines: LedgerLine[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  closingSide: BalanceType;
};

export type LedgerQuery = {
  fromDate?: string | null;
  toDate?: string | null;
};

export type VoucherListFilter = {
  voucherType?: VoucherType | VoucherType[];
  includeCancelled?: boolean;
};

export type ReceivePaymentInput = {
  voucherDate: string;
  customerId: string;
  /** Cash or Bank account */
  accountId: string;
  amount: number;
  referenceNo?: string | null;
  notes?: string | null;
};

export type MakePaymentInput = {
  voucherDate: string;
  vendorId: string;
  accountId: string;
  amount: number;
  referenceNo?: string | null;
  notes?: string | null;
};

export type ExpenseVoucherInput = {
  voucherDate: string;
  expenseAccountId: string;
  accountId: string;
  amount: number;
  vendorId?: string | null;
  referenceNo?: string | null;
  notes?: string | null;
};

export type IncomeVoucherInput = {
  voucherDate: string;
  incomeAccountId: string;
  accountId: string;
  amount: number;
  customerId?: string | null;
  referenceNo?: string | null;
  notes?: string | null;
};

// ─── Purchases ──────────────────────────────────────────────

export type PaymentMode = "cash" | "credit" | "bank";

export type PurchaseLineInput = {
  variantId: string;
  quantity: number;
  unitCost: number;
  discountAmount?: number;
  taxAmount?: number;
};

export type CreatePurchaseInput = {
  invoiceDate: string;
  vendorId: string;
  paymentMode: PaymentMode;
  /** Required when paidAmount > 0 */
  accountId?: string | null;
  paidAmount?: number;
  referenceNo?: string | null;
  notes?: string | null;
  discountAmount?: number;
  additionAmount?: number;
  taxAmount?: number;
  items: PurchaseLineInput[];
};

export type PurchaseItem = {
  id: string;
  purchaseId: string;
  variantId: string;
  productName: string;
  size: string | null;
  color: string | null;
  quantity: number;
  unitCost: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
  lineOrder: number;
};

export type Purchase = {
  id: string;
  voucherId: string;
  invoiceNo: string;
  invoiceDate: string;
  vendorId: string | null;
  vendorName?: string | null;
  paymentMode: PaymentMode;
  subtotal: number;
  discountAmount: number;
  additionAmount: number;
  taxAmount: number;
  grandTotal: number;
  paidAmount: number;
  notes: string | null;
  status: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  items?: PurchaseItem[];
  shopName?: string;
  shopPhone?: string;
  shopAddress?: string;
  receiptFooter?: string;
  shopLogoDataUrl?: string | null;
};

export type PurchaseReturnLineInput = {
  variantId: string;
  quantity: number;
  unitCost: number;
};

export type CreatePurchaseReturnInput = {
  returnDate: string;
  vendorId: string;
  purchaseId?: string | null;
  refundMode: PaymentMode;
  accountId?: string | null;
  taxAmount?: number;
  notes?: string | null;
  items: PurchaseReturnLineInput[];
};

export type PurchaseReturnItem = {
  id: string;
  purchaseReturnId: string;
  variantId: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
};

export type PurchaseReturn = {
  id: string;
  voucherId: string;
  returnNo: string;
  returnDate: string;
  purchaseId: string | null;
  vendorId: string | null;
  vendorName?: string | null;
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  items?: PurchaseReturnItem[];
};

// ─── Sales ──────────────────────────────────────────────────

export type ReceiptSize = "thermal" | "a4";

export type SaleLineInput = {
  variantId: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  taxAmount?: number;
};

export type CreateSaleInput = {
  invoiceDate: string;
  customerId?: string | null;
  paymentMode: PaymentMode;
  accountId?: string | null;
  paidAmount?: number;
  referenceNo?: string | null;
  notes?: string | null;
  discountAmount?: number;
  additionAmount?: number;
  taxAmount?: number;
  items: SaleLineInput[];
};

export type SaleItem = {
  id: string;
  saleId: string;
  variantId: string;
  productName: string;
  size: string | null;
  color: string | null;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
  lineOrder: number;
};

export type Sale = {
  id: string;
  voucherId: string;
  invoiceNo: string;
  invoiceDate: string;
  customerId: string | null;
  customerName?: string | null;
  paymentMode: PaymentMode;
  subtotal: number;
  discountAmount: number;
  additionAmount: number;
  taxAmount: number;
  grandTotal: number;
  paidAmount: number;
  notes: string | null;
  status: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  items?: SaleItem[];
  shopName?: string;
  shopPhone?: string;
  shopAddress?: string;
  receiptFooter?: string;
  /** Data URL for receipt header logo (custom shop branding) */
  shopLogoDataUrl?: string | null;
};

export type SaleReturnLineInput = {
  variantId: string;
  quantity: number;
  unitPrice: number;
};

export type CreateSaleReturnInput = {
  returnDate: string;
  customerId?: string | null;
  saleId?: string | null;
  refundMode: PaymentMode;
  accountId?: string | null;
  taxAmount?: number;
  notes?: string | null;
  items: SaleReturnLineInput[];
};

export type SaleReturnItem = {
  id: string;
  saleReturnId: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type SaleReturn = {
  id: string;
  voucherId: string;
  returnNo: string;
  returnDate: string;
  saleId: string | null;
  customerId: string | null;
  customerName?: string | null;
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  items?: SaleReturnItem[];
};

export type ReportDateRange = {
  fromDate?: string;
  toDate?: string;
};

export type DashboardDayPoint = {
  date: string;
  salesTotal: number;
  salesCount: number;
  purchasesTotal: number;
  purchasesCount: number;
};

export type DashboardPaymentSlice = {
  mode: string;
  total: number;
  count: number;
};

export type DashboardTopProduct = {
  productName: string;
  quantity: number;
  revenue: number;
};

export type DashboardLowStockItem = {
  productName: string;
  size: string | null;
  color: string | null;
  stockQty: number;
  reorderLevel: number;
};

export type DashboardRecentSale = {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  customerName: string | null;
  grandTotal: number;
  paymentMode: string;
};

export type DashboardSummary = {
  todaySalesTotal: number;
  todaySalesCount: number;
  todayPurchasesTotal: number;
  todayPurchasesCount: number;
  monthSalesTotal: number;
  monthPurchasesTotal: number;
  monthProfitEstimate: number;
  cashBalance: number;
  bankBalance: number;
  arBalance: number;
  apBalance: number;
  inventoryValue: number;
  lowStockCount: number;
  productCount: number;
  customerCount: number;
  vendorCount: number;
  openSaleInvoices: number;
  currencySymbol: string;
  last7Days: DashboardDayPoint[];
  last30Days: DashboardDayPoint[];
  salesByPaymentMode: DashboardPaymentSlice[];
  topProducts: DashboardTopProduct[];
  lowStockItems: DashboardLowStockItem[];
  recentSales: DashboardRecentSale[];
};

export type SalesReportRow = {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  customerName: string | null;
  paymentMode: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  paidAmount: number;
};

export type SalesReport = {
  fromDate: string | null;
  toDate: string | null;
  rows: SalesReportRow[];
  totalSubtotal: number;
  totalDiscount: number;
  totalTax: number;
  totalGrand: number;
  totalPaid: number;
  byPaymentMode: { mode: string; count: number; total: number }[];
  byDay: { date: string; count: number; total: number }[];
};

export type PurchasesReportRow = {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  vendorName: string | null;
  paymentMode: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  paidAmount: number;
};

export type PurchasesReport = {
  fromDate: string | null;
  toDate: string | null;
  rows: PurchasesReportRow[];
  totalSubtotal: number;
  totalDiscount: number;
  totalTax: number;
  totalGrand: number;
  totalPaid: number;
  byPaymentMode: { mode: string; count: number; total: number }[];
  byDay: { date: string; count: number; total: number }[];
};

export type ProfitReportLine = {
  accountCode: string;
  accountName: string;
  amount: number;
};

export type ProfitReport = {
  fromDate: string | null;
  toDate: string | null;
  salesRevenue: number;
  cogs: number;
  grossProfit: number;
  otherIncome: number;
  operatingExpenses: number;
  netProfit: number;
  incomeLines: ProfitReportLine[];
  expenseLines: ProfitReportLine[];
};

export type StockReportRow = {
  variantId: string;
  sku: string;
  productName: string;
  size: string | null;
  color: string | null;
  categoryName: string | null;
  stockQty: number;
  costPrice: number;
  salePrice: number;
  valuation: number;
  reorderLevel: number;
  isLowStock: boolean;
};

export type StockReport = {
  rows: StockReportRow[];
  totalQty: number;
  totalValuation: number;
  lowStockCount: number;
};

export type TaxReport = {
  fromDate: string | null;
  toDate: string | null;
  salesTax: number;
  purchaseTax: number;
  netTax: number;
  salesCount: number;
  purchaseCount: number;
};

export type DeletedDocumentRow = {
  id: string;
  documentType: "sale" | "purchase";
  documentNo: string;
  documentDate: string;
  partyName: string | null;
  paymentMode: string;
  grandTotal: number;
  deletedAt: string;
  /** Display name of the user who deleted (full name or username) */
  deletedBy: string | null;
  details: string | null;
};

export type DeletedDocumentsReport = {
  fromDate: string | null;
  toDate: string | null;
  rows: DeletedDocumentRow[];
  totalAmount: number;
  salesCount: number;
  purchasesCount: number;
};

/** Software-vendor registry: companies that started using Agri Soft Pro (local on this PC). */
export type ClientCompany = {
  id: string;
  companyName: string;
  area: string;
  joinedAt: string;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ClientCompanyInput = {
  companyName: string;
  area: string;
  joinedAt: string;
  notes?: string | null;
  isActive?: boolean;
};

export type AreaDemandRow = {
  area: string;
  companyCount: number;
};

export type CompaniesDemandSummary = {
  totalCompanies: number;
  activeCompanies: number;
  areaDemand: AreaDemandRow[];
};

export type AppSetting = {
  key: string;
  value: string;
  groupName: string;
};

export type SettingsMap = Record<string, string>;

export type SettingsUpdateInput = {
  shop_name?: string;
  shop_phone?: string;
  shop_address?: string;
  currency_symbol?: string;
  currency_code?: string;
  tax_mode?: string;
  receipt_footer?: string;
};

export type AppUser = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  roleId: string;
  roleName: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UserCreateInput = {
  username: string;
  fullName: string;
  password: string;
  roleId: string;
  email?: string | null;
  phone?: string | null;
  isActive?: boolean;
};

export type UserUpdateInput = {
  fullName?: string;
  roleId?: string;
  email?: string | null;
  phone?: string | null;
  isActive?: boolean;
};

export type RoleInfo = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
};

export type PermissionInfo = {
  id: string;
  code: string;
  module: string;
  description: string | null;
};

export type AuditLogRow = {
  id: string;
  userId: string | null;
  username: string | null;
  action: string;
  module: string;
  entityId: string | null;
  details: string | null;
  createdAt: string;
};

export type AuditListQuery = {
  fromDate?: string;
  toDate?: string;
  module?: string;
  action?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export type AuditListResult = {
  rows: AuditLogRow[];
  total: number;
  modules: string[];
  actions: string[];
};

export type BackupFileInfo = {
  path: string;
  fileName: string;
  sizeBytes: number;
  modifiedAt: string;
  kind: "auto" | "manual";
};

export type BackupStatus = {
  liveDbPath: string;
  backupRoot: string;
  autoDir: string;
  keepDays: number;
  lastAutoBackupAt: string | null;
  lastAutoBackupPath: string | null;
  autoBackups: BackupFileInfo[];
};

export type LicensePlan = "monthly" | "yearly" | "forever";

export type LicenseStatus = {
  installId: string;
  installedAt: string;
  trialEndsAt: string;
  trialDaysLeft: number;
  mode: "trial" | "pro" | "locked";
  allowed: boolean;
  plan: LicensePlan | null;
  expiresAt: string | null;
  licenseName: string | null;
  isDevBypass: boolean;
};

export type LicenseRow = {
  id: string;
  name: string;
  installId: string;
  plan: LicensePlan;
  activatedAt: string;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
};

export type LicenseCreateInput = {
  name: string;
  installId: string;
  plan: LicensePlan;
  notes?: string | null;
};

export type ElectronAPI = {
  ping: () => Promise<string>;
  getAppInfo: () => Promise<AppInfo>;
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  getCurrentUser: () => Promise<SessionUser | null>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<ActionResult>;
  getDbStats: () => Promise<DbStats>;

  nextDocumentNumber: (docType: DocType) => Promise<ActionResult<string>>;

  listUnits: () => Promise<ActionResult<Unit[]>>;
  createUnit: (input: UnitInput) => Promise<ActionResult<Unit>>;
  updateUnit: (id: string, input: UnitInput) => Promise<ActionResult<Unit>>;
  deleteUnit: (id: string) => Promise<ActionResult>;

  listCategories: () => Promise<ActionResult<Category[]>>;
  createCategory: (input: CategoryInput) => Promise<ActionResult<Category>>;
  updateCategory: (id: string, input: CategoryInput) => Promise<ActionResult<Category>>;
  deleteCategory: (id: string) => Promise<ActionResult>;

  listTaxes: () => Promise<ActionResult<Tax[]>>;
  createTax: (input: TaxInput) => Promise<ActionResult<Tax>>;
  updateTax: (id: string, input: TaxInput) => Promise<ActionResult<Tax>>;
  deleteTax: (id: string) => Promise<ActionResult>;

  listDiscounts: () => Promise<ActionResult<Discount[]>>;
  createDiscount: (input: DiscountInput) => Promise<ActionResult<Discount>>;
  updateDiscount: (id: string, input: DiscountInput) => Promise<ActionResult<Discount>>;
  deleteDiscount: (id: string) => Promise<ActionResult>;

  listAdditions: () => Promise<ActionResult<Addition[]>>;
  createAddition: (input: AdditionInput) => Promise<ActionResult<Addition>>;
  updateAddition: (id: string, input: AdditionInput) => Promise<ActionResult<Addition>>;
  deleteAddition: (id: string) => Promise<ActionResult>;

  listProducts: () => Promise<ActionResult<Product[]>>;
  getProduct: (id: string) => Promise<ActionResult<Product>>;
  createProduct: (input: ProductInput) => Promise<ActionResult<Product>>;
  updateProduct: (id: string, input: ProductInput) => Promise<ActionResult<Product>>;
  deleteProduct: (id: string) => Promise<ActionResult>;

  listVariants: (productId: string) => Promise<ActionResult<ProductVariant[]>>;
  createVariant: (productId: string, input: ProductVariantInput) => Promise<ActionResult<ProductVariant>>;
  updateVariant: (id: string, input: ProductVariantInput) => Promise<ActionResult<ProductVariant>>;
  deleteVariant: (id: string) => Promise<ActionResult>;

  listInventory: () => Promise<ActionResult<InventoryRow[]>>;
  adjustStock: (input: StockAdjustInput) => Promise<ActionResult<InventoryRow>>;
  findInventoryByBarcode: (barcode: string) => Promise<ActionResult<InventoryRow>>;

  listCustomers: () => Promise<ActionResult<Customer[]>>;
  createCustomer: (input: CustomerInput) => Promise<ActionResult<Customer>>;
  updateCustomer: (id: string, input: CustomerInput) => Promise<ActionResult<Customer>>;
  deleteCustomer: (id: string) => Promise<ActionResult>;

  listVendors: () => Promise<ActionResult<Vendor[]>>;
  createVendor: (input: VendorInput) => Promise<ActionResult<Vendor>>;
  updateVendor: (id: string, input: VendorInput) => Promise<ActionResult<Vendor>>;
  deleteVendor: (id: string) => Promise<ActionResult>;

  listAccounts: (filter?: AccountListFilter) => Promise<ActionResult<Account[]>>;
  getAccount: (id: string) => Promise<ActionResult<Account>>;
  postVoucher: (input: PostVoucherInput) => Promise<ActionResult<Voucher>>;
  updateVoucher: (id: string, input: PostVoucherInput) => Promise<ActionResult<Voucher>>;
  getVoucher: (id: string) => Promise<ActionResult<Voucher>>;
  listVouchers: (filter?: VoucherListFilter) => Promise<ActionResult<Voucher[]>>;
  cancelVoucher: (id: string) => Promise<ActionResult>;
  getAccountLedger: (accountId: string, query?: LedgerQuery) => Promise<ActionResult<AccountLedger>>;
  getPartyLedger: (
    partyType: PartyType,
    partyId: string,
    query?: LedgerQuery
  ) => Promise<ActionResult<PartyLedger>>;

  receivePayment: (input: ReceivePaymentInput) => Promise<ActionResult<Voucher>>;
  updateReceivePayment: (id: string, input: ReceivePaymentInput) => Promise<ActionResult<Voucher>>;
  makePayment: (input: MakePaymentInput) => Promise<ActionResult<Voucher>>;
  updateMakePayment: (id: string, input: MakePaymentInput) => Promise<ActionResult<Voucher>>;
  postExpense: (input: ExpenseVoucherInput) => Promise<ActionResult<Voucher>>;
  updateExpense: (id: string, input: ExpenseVoucherInput) => Promise<ActionResult<Voucher>>;
  postIncome: (input: IncomeVoucherInput) => Promise<ActionResult<Voucher>>;
  updateIncome: (id: string, input: IncomeVoucherInput) => Promise<ActionResult<Voucher>>;

  listPurchases: () => Promise<ActionResult<Purchase[]>>;
  getPurchase: (id: string) => Promise<ActionResult<Purchase>>;
  listPurchasesByVendor: (vendorId: string) => Promise<ActionResult<Purchase[]>>;
  createPurchase: (input: CreatePurchaseInput) => Promise<ActionResult<Purchase>>;
  updatePurchase: (id: string, input: CreatePurchaseInput) => Promise<ActionResult<Purchase>>;
  deletePurchase: (id: string) => Promise<ActionResult>;
  listPurchaseReturns: () => Promise<ActionResult<PurchaseReturn[]>>;
  getPurchaseReturn: (id: string) => Promise<ActionResult<PurchaseReturn>>;
  createPurchaseReturn: (input: CreatePurchaseReturnInput) => Promise<ActionResult<PurchaseReturn>>;

  listSales: () => Promise<ActionResult<Sale[]>>;
  getSale: (id: string) => Promise<ActionResult<Sale>>;
  listSalesByCustomer: (customerId: string) => Promise<ActionResult<Sale[]>>;
  createSale: (input: CreateSaleInput) => Promise<ActionResult<Sale>>;
  updateSale: (id: string, input: CreateSaleInput) => Promise<ActionResult<Sale>>;
  deleteSale: (id: string) => Promise<ActionResult>;
  listSaleReturns: () => Promise<ActionResult<SaleReturn[]>>;
  getSaleReturn: (id: string) => Promise<ActionResult<SaleReturn>>;
  createSaleReturn: (input: CreateSaleReturnInput) => Promise<ActionResult<SaleReturn>>;

  getDashboardSummary: () => Promise<ActionResult<DashboardSummary>>;
  getSalesReport: (query?: ReportDateRange) => Promise<ActionResult<SalesReport>>;
  getPurchasesReport: (query?: ReportDateRange) => Promise<ActionResult<PurchasesReport>>;
  getProfitReport: (query?: ReportDateRange) => Promise<ActionResult<ProfitReport>>;
  getStockReport: () => Promise<ActionResult<StockReport>>;
  getTaxReport: (query?: ReportDateRange) => Promise<ActionResult<TaxReport>>;
  getDeletedDocumentsReport: (query?: ReportDateRange) => Promise<ActionResult<DeletedDocumentsReport>>;

  listClientCompanies: () => Promise<ActionResult<ClientCompany[]>>;
  createClientCompany: (input: ClientCompanyInput) => Promise<ActionResult<ClientCompany>>;
  updateClientCompany: (id: string, input: ClientCompanyInput) => Promise<ActionResult<ClientCompany>>;
  deleteClientCompany: (id: string) => Promise<ActionResult>;
  getCompaniesDemand: () => Promise<ActionResult<CompaniesDemandSummary>>;

  getSettings: () => Promise<ActionResult<SettingsMap>>;
  updateSettings: (input: SettingsUpdateInput) => Promise<ActionResult<SettingsMap>>;
  setShopLogo: (dataUrl: string) => Promise<ActionResult<SettingsMap>>;
  clearShopLogo: () => Promise<ActionResult<SettingsMap>>;

  listUsers: () => Promise<ActionResult<AppUser[]>>;
  createUser: (input: UserCreateInput) => Promise<ActionResult<AppUser>>;
  updateUser: (id: string, input: UserUpdateInput) => Promise<ActionResult<AppUser>>;
  setUserPassword: (id: string, password: string) => Promise<ActionResult>;
  listRoles: () => Promise<ActionResult<RoleInfo[]>>;
  listPermissions: () => Promise<ActionResult<PermissionInfo[]>>;
  setRolePermissions: (roleId: string, permissionCodes: string[]) => Promise<ActionResult<RoleInfo>>;
  listAuditLogs: (query?: AuditListQuery) => Promise<ActionResult<AuditListResult>>;

  /** Print self-contained HTML via a dedicated Electron print window. */
  printHtml: (html: string) => Promise<ActionResult>;
  /** Save file bytes via native Save dialog (real download). */
  saveFile: (input: {
    defaultPath: string;
    dataBase64: string;
    filters?: { name: string; extensions: string[] }[];
  }) => Promise<ActionResult<{ path: string } | null>>;

  getBackupStatus: () => Promise<ActionResult<BackupStatus>>;
  runManualBackup: () => Promise<ActionResult<BackupFileInfo | null>>;
  runAutoBackupNow: () => Promise<ActionResult<BackupFileInfo | null>>;
  restoreBackup: (sourcePath: string) => Promise<ActionResult<{ relaunching: true }>>;
  pickBackupFile: () => Promise<ActionResult<string | null>>;
  openBackupFolder: () => Promise<ActionResult>;

  getLicenseStatus: () => Promise<ActionResult<LicenseStatus>>;
  listLicenses: () => Promise<ActionResult<LicenseRow[]>>;
  createLicense: (input: LicenseCreateInput) => Promise<ActionResult<LicenseRow>>;
  deleteLicense: (id: string) => Promise<ActionResult>;
  expireTrialForTesting: () => Promise<ActionResult<LicenseStatus>>;
};

declare global {
  interface Window {
    api?: ElectronAPI;
  }
}

export {};
