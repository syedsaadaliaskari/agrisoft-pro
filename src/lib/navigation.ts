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
  MapPinned,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export const navigation: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
    ],
  },
  {
    title: "Sales",
    items: [
      { label: "Sale", href: "/sales", icon: ShoppingCart, permission: "sales.view" },
      { label: "Sale Return", href: "/sales/returns", icon: Undo2, permission: "sales.return" },
    ],
  },
  {
    title: "Purchases",
    items: [
      { label: "Purchase", href: "/purchases", icon: PackagePlus, permission: "purchases.view" },
      {
        label: "Purchase Return",
        href: "/purchases/returns",
        icon: PackageMinus,
        permission: "purchases.return",
      },
    ],
  },
  {
    title: "Catalog",
    items: [
      { label: "Units", href: "/units", icon: Ruler, permission: "products.view" },
      { label: "Categories", href: "/categories", icon: Tags, permission: "products.view" },
      { label: "Products", href: "/products", icon: Package, permission: "products.view" },
      { label: "Inventory", href: "/inventory", icon: Warehouse, permission: "inventory.view" },
    ],
  },
  {
    title: "Parties",
    items: [
      { label: "Customers", href: "/customers", icon: Users, permission: "customers.view" },
      { label: "Vendors", href: "/vendors", icon: Truck, permission: "vendors.view" },
    ],
  },
  {
    title: "Transactions",
    items: [
      { label: "Journal", href: "/transactions/journal", icon: BookOpen, permission: "transactions.view" },
      {
        label: "Receive Payment",
        href: "/transactions/receive",
        icon: ArrowDownLeft,
        permission: "transactions.view",
      },
      {
        label: "Make Payment",
        href: "/transactions/pay",
        icon: ArrowUpRight,
        permission: "transactions.view",
      },
      { label: "Expense", href: "/transactions/expense", icon: Wallet, permission: "transactions.view" },
      { label: "Income", href: "/transactions/income", icon: TrendingUp, permission: "transactions.view" },
    ],
  },
  {
    title: "Ledgers",
    items: [
      { label: "Accounts Ledger", href: "/ledgers/accounts", icon: BookOpen, permission: "ledgers.view" },
      {
        label: "Customer Ledger",
        href: "/ledgers/customers",
        icon: UserRound,
        permission: "ledgers.view",
      },
      {
        label: "Vendor Ledger",
        href: "/ledgers/vendors",
        icon: Building2,
        permission: "ledgers.view",
      },
      { label: "Expense Ledger", href: "/ledgers/expenses", icon: Wallet, permission: "ledgers.view" },
      { label: "Income Ledger", href: "/ledgers/income", icon: TrendingUp, permission: "ledgers.view" },
    ],
  },
  {
    title: "Reports",
    items: [
      { label: "Sales Report", href: "/reports/sales", icon: BarChart3, permission: "reports.view" },
      {
        label: "Purchase Report",
        href: "/reports/purchases",
        icon: BarChart3,
        permission: "reports.view",
      },
      { label: "Profit & Loss", href: "/reports/profit", icon: TrendingUp, permission: "reports.view" },
      { label: "Stock Report", href: "/reports/stock", icon: Warehouse, permission: "reports.view" },
      { label: "Tax Report", href: "/reports/tax", icon: Receipt, permission: "reports.view" },
      { label: "Deleted Data", href: "/reports/deleted", icon: Trash2, permission: "reports.view" },
    ],
  },
  {
    title: "Platform",
    items: [
      {
        label: "Client Companies",
        href: "/platform/companies",
        icon: MapPinned,
        permission: "platform.view",
      },
    ],
  },
  {
    title: "Setup",
    items: [
      { label: "Taxes", href: "/setup/taxes", icon: Percent, permission: "settings.manage" },
      { label: "Discounts", href: "/setup/discounts", icon: Percent, permission: "settings.manage" },
      { label: "Additions", href: "/setup/additions", icon: PlusCircle, permission: "settings.manage" },
      { label: "Users & RBAC", href: "/settings/users", icon: Shield, permission: "users.manage" },
      { label: "Settings", href: "/settings", icon: Settings, permission: "settings.manage" },
    ],
  },
];
