import {
  LayoutDashboard,
  ShoppingCart,
  Undo2,
  PackagePlus,
  PackageMinus,
  Package,
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
  ClipboardList,
  HardDrive,
  KeyRound,
  Lock,
  type LucideIcon,
} from "lucide-react";

/** shop = ERP menus; platform = vendor Super Admin console; both = either audience */
export type NavAudience = "shop" | "platform" | "both";

export type NavItem = {
  labelKey: string;
  href: string;
  icon: LucideIcon;
  /** Single required permission (ignored if anyOfPermissions is set) */
  permission?: string;
  /** Show if user has any of these permissions */
  anyOfPermissions?: string[];
  /** Who should see this link. Default: shop */
  audience?: NavAudience;
};

export type NavGroup = {
  titleKey: string;
  icon: LucideIcon;
  items: NavItem[];
};

export const navigation: NavGroup[] = [
  {
    titleKey: "nav.overview",
    icon: LayoutDashboard,
    items: [
      {
        labelKey: "nav.dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        permission: "dashboard.view",
        audience: "both",
      },
      {
        labelKey: "nav.licenses",
        href: "/platform/licenses",
        icon: KeyRound,
        anyOfPermissions: ["license.view", "platform.view", "license.manage"],
        audience: "platform",
      },
    ],
  },
  {
    titleKey: "nav.sales",
    icon: ShoppingCart,
    items: [
      { labelKey: "nav.sale", href: "/sales", icon: ShoppingCart, permission: "sales.view" },
      { labelKey: "nav.saleReturn", href: "/sales/returns", icon: Undo2, permission: "sales.return" },
    ],
  },
  {
    titleKey: "nav.purchases",
    icon: PackagePlus,
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
    icon: Package,
    items: [
      { labelKey: "nav.products", href: "/products", icon: Package, permission: "products.view" },
      { labelKey: "nav.inventory", href: "/inventory", icon: Warehouse, permission: "inventory.view" },
    ],
  },
  {
    titleKey: "nav.parties",
    icon: Users,
    items: [
      { labelKey: "nav.customers", href: "/customers", icon: Users, permission: "customers.view" },
      { labelKey: "nav.vendors", href: "/vendors", icon: Truck, permission: "vendors.view" },
    ],
  },
  {
    titleKey: "nav.transactions",
    icon: ArrowDownLeft,
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
      {
        labelKey: "nav.ownerDraw",
        href: "/transactions/owner-draw",
        icon: UserRound,
        permission: "transactions.view",
      },
      { labelKey: "nav.income", href: "/transactions/income", icon: TrendingUp, permission: "transactions.view" },
    ],
  },
  {
    titleKey: "nav.ledgers",
    icon: BookOpen,
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
    icon: BarChart3,
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
    icon: Settings,
    items: [
      { labelKey: "nav.taxes", href: "/setup/taxes", icon: Percent, permission: "settings.manage" },
      { labelKey: "nav.discounts", href: "/setup/discounts", icon: Percent, permission: "settings.manage" },
      { labelKey: "nav.additions", href: "/setup/additions", icon: PlusCircle, permission: "settings.manage" },
      {
        labelKey: "nav.users",
        href: "/settings/users",
        icon: Shield,
        permission: "users.manage",
        audience: "both",
      },
      { labelKey: "nav.changePassword", href: "/settings/password", icon: Lock, audience: "both" },
      {
        labelKey: "nav.licenseInfo",
        href: "/settings/license",
        icon: KeyRound,
        anyOfPermissions: ["license.manage", "platform.view", "license.view"],
        audience: "platform",
      },
      {
        labelKey: "nav.backup",
        href: "/settings/backup",
        icon: HardDrive,
        permission: "settings.manage",
        audience: "both",
      },
      {
        labelKey: "nav.audit",
        href: "/settings/audit",
        icon: ClipboardList,
        permission: "settings.manage",
        audience: "both",
      },
      {
        labelKey: "nav.settings",
        href: "/settings",
        icon: Settings,
        permission: "settings.manage",
        audience: "both",
      },
    ],
  },
];

/** True when pathname belongs to this nav href (handles trailing slash + nested routes). */
export function isNavHrefActive(pathname: string, href: string): boolean {
  if (pathname === href || pathname === href + "/") return true;
  if (href === "/dashboard") return false;
  if (href === "/settings") {
    return pathname === "/settings" || pathname === "/settings/";
  }
  if (href === "/sales") {
    return (
      pathname === "/sales" ||
      pathname === "/sales/" ||
      (pathname.startsWith("/sales/") && !pathname.startsWith("/sales/returns"))
    );
  }
  if (href === "/purchases") {
    return (
      pathname === "/purchases" ||
      pathname === "/purchases/" ||
      (pathname.startsWith("/purchases/") && !pathname.startsWith("/purchases/returns"))
    );
  }
  return pathname.startsWith(href + "/");
}

export function isNavGroupActive(pathname: string, group: NavGroup): boolean {
  return group.items.some((item) => isNavHrefActive(pathname, item.href));
}
