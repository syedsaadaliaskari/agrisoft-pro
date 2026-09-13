import { getSqlite } from "./index";

const KEEP_SETTINGS = new Set([
  "license_install_id",
  "license_installed_at",
  "vendor_unlocked",
]);

/** Empty local shop tables so a join can pull the cloud shop. Does not touch cloud. */
export function clearLocalShopData(): void {
  const sqlite = getSqlite();
  sqlite.pragma("foreign_keys = OFF");
  sqlite.exec(`
    DELETE FROM sale_return_items;
    DELETE FROM purchase_return_items;
    DELETE FROM sale_returns;
    DELETE FROM purchase_returns;
    DELETE FROM sale_items;
    DELETE FROM purchase_items;
    DELETE FROM sales;
    DELETE FROM purchases;
    DELETE FROM stock_movements;
    DELETE FROM voucher_entries;
    DELETE FROM vouchers;
    DELETE FROM product_variants;
    DELETE FROM products;
    DELETE FROM customers;
    DELETE FROM vendors;
    DELETE FROM document_counters;
    DELETE FROM taxes;
    DELETE FROM discounts;
    DELETE FROM additions;
    DELETE FROM categories;
    DELETE FROM units;
    DELETE FROM accounts;
    DELETE FROM audit_logs;
    DELETE FROM users;
    DELETE FROM role_permissions
      WHERE role_id NOT IN (SELECT id FROM roles WHERE name = 'Super Admin');
    DELETE FROM roles WHERE name != 'Super Admin';
  `);
  const keep = [...KEEP_SETTINGS].map((k) => `'${k}'`).join(",");
  sqlite.exec(`DELETE FROM settings WHERE key NOT IN (${keep});`);
  sqlite.pragma("foreign_keys = ON");
}
