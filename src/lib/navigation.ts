import {
  LayoutDashboard,
  ShoppingCart,
  Undo2,
  PackagePlus,
  PackageMinus,
  Package,
  Tags,
  Ruler,
  Warehouse,
  Users,
  Truck,
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  UserRound,
  Building2,
  Wallet,
  TrendingUp,
  BarChart3,
  Settings,
  Shield,
  Percent,
  PlusCircle,
  Receipt,
  Trash2,
  HardDrive,
  KeyRound,
  Lock,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  labelKey: string;
  href: string;
  icon: LucideIcon;
  /** Single required permission (ignored if anyOfPermissions is set) */
  permission?: string;
  /** Show if user has any of these permissions */
  anyOfPermissions?: string[];
};

export type NavGroup = {
  titleKey: string;
  items: NavItem[];
};

export const navigation: NavGroup[] = [
  {
    titleKey: "nav.overview",
    items: [
      { labelKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
      {
        labelKey: "nav.licenses",
        href: "/platform/licenses",
        icon: KeyRound,
        anyOfPermissions: ["license.view", "platform.view", "license.manage"],
      },
    ],
  },
  {
    titleKey: "nav.sales",
    items: [
      { labelKey: "nav.sale", href: "/sales", icon: ShoppingCart, permission: "sales.view" },
      { labelKey: "nav.saleReturn", href: "/sales/returns", icon: Undo2, permission: "sales.return" },
    ],
  },
  {
    titleKey: "nav.purchases",
    items: [
      { labelKey: "nav.purchase", href: "/purchases", icon: PackagePlus, permission: "purchases.view" },
      {
        labelKey: "nav.purchaseReturn",
        href: "/purchases/returns",
        icon: PackageMinus,
        permission: "purchases.return",
      },
    ],
  },
  {
    titleKey: "nav.catalog",
    items: [
      { labelKey: "nav.units", href: "/units", icon: Ruler, permission: "products.view" },
      { labelKey: "nav.categories", href: "/categories", icon: Tags, permission: "products.view" },
      { labelKey: "nav.products", href: "/products", icon: Package, permission: "products.view" },
      { labelKey: "nav.inventory", href: "/inventory", icon: Warehouse, permission: "inventory.view" },
    ],
  },
  {
    titleKey: "nav.parties",
    items: [
      { labelKey: "nav.customers", href: "/customers", icon: Users, permission: "customers.view" },
      { labelKey: "nav.vendors", href: "/vendors", icon: Truck, permission: "vendors.view" },
    ],
  },
  {
    titleKey: "nav.transactions",
    items: [
      { labelKey: "nav.journal", href: "/transactions/journal", icon: BookOpen, permission: "transactions.view" },
      {
        labelKey: "nav.receivePayment",
        href: "/transactions/receive",
        icon: ArrowDownLeft,
        permission: "transactions.view",
      },
      {
        labelKey: "nav.makePayment",
        href: "/transactions/pay",
        icon: ArrowUpRight,
        permission: "transactions.view",
      },
      { labelKey: "nav.expense", href: "/transactions/expense", icon: Wallet, permission: "transactions.view" },
      { labelKey: "nav.income", href: "/transactions/income", icon: TrendingUp, permission: "transactions.view" },
    ],
  },
  {
    titleKey: "nav.ledgers",
    items: [
      { labelKey: "nav.accountsLedger", href: "/ledgers/accounts", icon: BookOpen, permission: "ledgers.view" },
      {
        labelKey: "nav.customerLedger",
        href: "/ledgers/customers",
        icon: UserRound,
        permission: "ledgers.view",
      },
      {
        labelKey: "nav.vendorLedger",
        href: "/ledgers/vendors",
        icon: Building2,
        permission: "ledgers.view",
      },
      { labelKey: "nav.expenseLedger", href: "/ledgers/expenses", icon: Wallet, permission: "ledgers.view" },
      { labelKey: "nav.incomeLedger", href: "/ledgers/income", icon: TrendingUp, permission: "ledgers.view" },
    ],
  },
  {
    titleKey: "nav.reports",
    items: [
      { labelKey: "nav.salesReport", href: "/reports/sales", icon: BarChart3, permission: "reports.view" },
      {
        labelKey: "nav.purchaseReport",
        href: "/reports/purchases",
        icon: BarChart3,
        permission: "reports.view",
      },
      { labelKey: "nav.profitLoss", href: "/reports/profit", icon: TrendingUp, permission: "reports.view" },
      { labelKey: "nav.stockReport", href: "/reports/stock", icon: Warehouse, permission: "reports.view" },
      { labelKey: "nav.taxReport", href: "/reports/tax", icon: Receipt, permission: "reports.view" },
      { labelKey: "nav.deletedData", href: "/reports/deleted", icon: Trash2, permission: "reports.view" },
    ],
  },
  {
    titleKey: "nav.setup",
    items: [
      { labelKey: "nav.taxes", href: "/setup/taxes", icon: Percent, permission: "settings.manage" },
      { labelKey: "nav.discounts", href: "/setup/discounts", icon: Percent, permission: "settings.manage" },
      { labelKey: "nav.additions", href: "/setup/additions", icon: PlusCircle, permission: "settings.manage" },
      { labelKey: "nav.users", href: "/settings/users", icon: Shield, permission: "users.manage" },
      { labelKey: "nav.changePassword", href: "/settings/password", icon: Lock },
      { labelKey: "nav.licenseInfo", href: "/settings/license", icon: KeyRound, anyOfPermissions: ["license.manage", "platform.view"] },
      { labelKey: "nav.backup", href: "/settings/backup", icon: HardDrive, permission: "settings.manage" },
      { labelKey: "nav.settings", href: "/settings", icon: Settings, permission: "settings.manage" },
    ],
  },
];
