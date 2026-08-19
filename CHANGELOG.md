# Changelog

## Unreleased

### Removed
- Multi-PC (LAN) mode — multi-device will use cloud sync instead of Wi‑Fi peer sharing.

### Cloud sync
- Customers auto-sync when online (app start, every 15 minutes, and when the connection returns). Manual “Sync customers now” remains in Settings.
- Each company gets a unique Supabase `tenants.id` when you Activate Pro. The ID is embedded in the activation code, stored on the shop PC, and used for all sync (Supabase = main server for every shop).
- Re-activating the same Install ID reuses the same cloud shop ID. `.env` `SUPABASE_TENANT_ID` remains a vendor/dev fallback only.

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
