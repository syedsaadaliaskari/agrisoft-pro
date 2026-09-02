# Changelog

## Unreleased

### Print
- Save & print on sales, purchases, returns, receipts, payments, income, expense, owner draw, and journal.
- Print menu now includes **Save as image** (Pictures/gallery) and **WhatsApp picture** (saves, copies, opens WhatsApp to paste).

### Wording
- Party opening type is Receivable or Payable. Sale remainder is Receivable; purchase remainder is Payable. Credit / debit posting is unchanged.

### Transactions
- Receive payment, make payment, income, expense, and owner draw can split one amount across cash and bank (same as sales/purchases). Cash plus bank must equal the amount — no credit remainder.
- Cash and bank running totals: each sale, purchase, return, receipt, payment, income, expense, owner draw, and journal adds or takes from cash and/or bank. Dashboard shows Opening / In / Out / Now for both books plus today's movement by type. Document screens show cash & bank now, this document's change, and the amount after save.

## 0.2.0 — 2026-08-30

### Print
- Sale, purchase, and return receipts (thermal + A4) show quantity with unit (`5 kg`), matching the on-screen invoice.

### Removed
- Multi-PC (LAN) mode — multi-device will use cloud sync instead of Wi‑Fi peer sharing.

### Cloud sync
- Auto-sync when online (app start, every 15 minutes, network return) + manual Sync now.
- Syncs shop ERP data to Supabase: masters (units/categories/taxes/discounts/additions), customers, vendors, accounts, products/variants, vouchers/entries, sales, purchases, sale/purchase returns, stock movements, document counters.
- Each company gets a unique Supabase `tenants.id` from Pro activation (`.env` tenant is vendor/dev fallback only).
- Not synced: local users/passwords, audit log, vendor platform (client companies / licenses).

## 0.1.5 — 2026-08-12

### Multi-PC (LAN)
- Optional LAN mode: **This PC alone**, **This PC is main**, or **Connect to main**.
- Main PC shares users, stock, and sales with cashier PCs on the same Wi‑Fi.
- Connect by IP (copy from main) or LAN discovery; access key required.
- Settings → Multi-PC (LAN); also available from the login screen.

### Super Admin
- License, Activated list, and Dashboard companies + area graph reliably visible for Super Admin.

## 0.1.3 — 2026-08-06

### Dashboard & UX
- Super Admin client companies + demand-by-area live on the **Dashboard** (no separate Platform route).
- Export / Print menus stay **inside** their button container (no floating portal).
- Route boot uses **skeleton** chrome; dashboard shows skeleton while data loads.
- Sign-in shows a **Welcome** sequence instead of a plain loading label.

## 0.1.2 — 2026-08-06

### UX fixes
- Login: cleaner screen, no password/username hints on screen; fixed double-click race.
- Navigation: AppShell no longer blanks the UI on every link click.
- Export: Save dialog downloads JSON/CSV/HTML (no random print window for list export).
- Deleted report: shows **Deleted by** (user full name).

### Super Admin (local)
- Role **Super Admin** + permission `platform.view`.
- **Client Companies** page: company name, area, join date, demand-by-area chart (registry on this PC).

## 0.1.1 — 2026-08-06

### Hardening (stock & balances)

- Sale create aggregates duplicate pack lines before stock checks (prevents negative stock via API).
- Sale / purchase delete blocked when linked returns exist (avoids double stock restore / over-remove).
- Sale / purchase return capped to remaining sold/purchased qty; status `"returned"` only when fully returned.
- Sale / purchase edit blocked when returns exist.
- Purchase update/delete reverse stock by aggregated variant qty (no partial mutate-then-fail).
- Cash/bank returns no longer skew party AR/AP ledgers (only credit refunds move party balance).
- Customer/vendor opening balance create/update/delete syncs AR (1300) / AP (2100) control account openings.

### Transactions polish

- Expense, income, and journal: list recent vouchers, edit, and cancel (same pattern as receive/pay).

### Docs

- README updated for print/export/edit/reseed/db paths.
- This changelog added.

## 0.1.0

- Core ERP Steps 1–10: masters, sales/purchases/returns, ledgers, transactions, dashboard, reports.
- Print (thermal + A4), export (JSON/CSV/PDF), richer dashboard, full demo seed.
- Edit for sales, purchases, receive payment, make payment.
