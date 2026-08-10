/** Human-readable labels for audit log module/action codes */
const MODULE_LABELS: Record<string, string> = {
  auth: "Sign-in",
  users: "Users",
  roles: "Roles",
  settings: "Settings",
  sales: "Sales",
  purchases: "Purchases",
  products: "Products",
  inventory: "Inventory",
  customers: "Customers",
  vendors: "Vendors",
  transactions: "Transactions",
  vouchers: "Vouchers",
  backup: "Backup",
  license: "License",
  companies: "Companies",
  accounts: "Accounts",
};

const ACTION_LABELS: Record<string, string> = {
  login: "Signed in",
  logout: "Signed out",
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  cancel: "Cancelled",
  set_password: "Password reset (admin)",
  change_password: "Password changed",
  update_permissions: "Permissions updated",
  backup: "Backup",
  restore: "Restore",
};

export function formatAuditModule(module: string): string {
  return MODULE_LABELS[module] ?? module;
}

export function formatAuditAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

export function formatAuditWhen(iso: string): string {
  return iso.replace("T", " ").slice(0, 19);
}
