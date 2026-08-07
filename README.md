# Agri Soft Pro

Local desktop agri ERP built with **Electron + Next.js (static export) + SQLite / Drizzle**.

## Architecture

```
Renderer (Next.js) --IPC--> Preload --IPC--> Main (Electron) --> SQLite
```

## What's included

- Desktop foundation: Electron + Next static export + IPC
- Theme + AppShell (graphite / soft cyan)
- Full SQLite schema + demo seed (`admin` / `admin123`, also `cashier` / `cashier123`)
- Auth + RBAC + Settings / Users / Taxes / Discounts / Additions
- Masters CRUD: Units, Categories, Products (+ packs), Inventory, Customers, Vendors
- Sales & returns (stock out, ledger, soft-delete with stock restore, print)
- Purchases & returns (stock in, payables, print)
- Ledgers: accounts, customers, vendors, expense, income
- Transactions: receive, pay, expense, income, journal — create **and edit** (cancel supported)
- Dashboard KPIs / charts + reports (sales, purchases, P&L, stock, tax, deleted)
- Print: thermal 80mm + A4 for sales / purchases / returns
- Export: JSON / Excel(CSV) / PDF on list & report pages
- Windows NSIS installer via `electron-builder` (`npm run dist`)

## Database (where your data lives)

| Mode | File |
|------|------|
| Dev (`npm run dev`) | `./data/agri-soft-pro.dev.db` |
| Installed app | `%APPDATA%\Agri Soft Pro\data\agri-soft-pro.db` |

Browse tables with Drizzle Studio (close the app first):

```bash
npm run db:studio
```

Or open the `.db` file in [DB Browser for SQLite](https://sqlitebrowser.org/).

Schema source of truth: `electron/db/schema.ts`.

## How to run

```bash
npm install
npm run dev
```

- Next.js: http://localhost:3000
- Electron loads that URL in development

Default login: `admin` / `admin123`

### Reseed demo data

Close the app, then:

```bash
npm run db:reset
npm run db:reseed
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Next + Electron together |
| `npm run build` | Static export + compile Electron |
| `npm start` | Run packaged static build via Electron |
| `npm run dist` | Windows NSIS installer → `release/` |
| `npm run db:studio` | Browse SQLite in the browser |
| `npm run db:reset` | Delete local DB files |
| `npm run db:reseed` | Rebuild Electron + load full demo seed |

## Out of scope (not built)

Cloud sync, multi-branch (multi-store), barcode hardware, advanced tax engine, full audit UI, auto-updater.

## Backup & restore

- **Auto:** on app start (if today’s file missing) and on app close (refresh today’s file)
- **Folder:** `Documents\Agri Soft Pro Backups\` (auto files under `auto\`)
- **Manual / restore:** Setup → **Backup & Restore**
- Format is the SQLite `.db` file (not PDF). Keep last 14 auto days.
