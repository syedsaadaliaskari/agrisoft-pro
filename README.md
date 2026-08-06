# Agri Soft Pro

Local desktop agri ERP built with **Electron + Next.js (static export) + SQLite**.

## Architecture

```
Renderer (Next.js) --IPC--> Preload --IPC--> Main (Electron) --> SQLite
```

## Steps 1–10 (complete)

- Desktop foundation: Electron + Next static export + IPC
- Theme + AppShell (graphite / soft cyan)
- Full SQLite schema + seed (`admin` / `admin123`), agri demo products/parties
- Auth + RBAC + Settings / Users / Taxes / Discounts / Additions
- Masters CRUD: Units, Categories, Products (+ packs), Inventory, Customers, Vendors
- Sales: POS entry, stock out, ledger, returns, print
- Purchases: entry, stock in, payables, returns
- Ledgers: accounts, customers, vendors, expense, income
- Transactions: receive, pay, expense, income, journal
- Dashboard KPIs/charts + reports; Windows installer via `electron-builder`

Dev DB: `./data/agri-soft-pro.dev.db` (created on first Electron launch)

```bash
npm install
npm run dev
```

- Next.js: http://localhost:3000
- Electron loads that URL in development

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Next + Electron together |
| `npm run build` | Static export + compile Electron |
| `npm start` | Run packaged static build via Electron |
| `npm run dist` | Windows NSIS installer (`release/`) |

Default login: `admin` / `admin123` (also `cashier` / `cashier123` after demo seed)
