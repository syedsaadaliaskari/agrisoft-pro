# Agri Soft Pro

Local desktop agri ERP built with **Electron + Next.js (static export) + SQLite**.

## Architecture

```
Renderer (Next.js) --IPC--> Preload --IPC--> Main (Electron) --> SQLite
```

## Step 1–3 (current)

- Desktop foundation: Electron + Next static export + IPC
- Theme + AppShell (graphite / soft cyan)
- Full SQLite schema + seed (`admin` / `admin123`), agri demo products/parties

Dev DB: `./data/agri-soft-pro.dev.db` (created on first Electron launch)

```bash
npm install
npm run dev
```

- Next.js: http://localhost:3000
- Electron loads that URL in development
- Dev DB: `./data/agri-soft-pro.dev.db`

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Next + Electron together |
| `npm run build` | Static export + compile Electron |
| `npm start` | Run packaged static build via Electron |
| `npm run dist` | Windows NSIS installer |

Default login (after Step 4): `admin` / `admin123`
