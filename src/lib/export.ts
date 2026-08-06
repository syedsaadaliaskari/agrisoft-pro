import type { ActionResult } from "@shared/ipc";
import { getApi, isElectron } from "@/lib/api";

export type ExportColumn<T extends Record<string, unknown> = Record<string, unknown>> = {
  key: keyof T & string;
  label: string;
};

function cellValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function saveBytes(
  filename: string,
  bytes: Uint8Array,
  filters: { name: string; extensions: string[] }[]
): Promise<string | null> {
  if (isElectron()) {
    const res = await getApi().saveFile({
      defaultPath: filename,
      dataBase64: toBase64(bytes),
      filters,
    });
    if (!res.ok) return res.error;
    return null;
  }

  // Browser fallback
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return null;
}

function textEncoder(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export async function exportJson(filename: string, rows: unknown[]): Promise<string | null> {
  const name = `${filename}-${stamp()}.json`;
  return saveBytes(name, textEncoder(JSON.stringify(rows, null, 2)), [
    { name: "JSON", extensions: ["json"] },
  ]);
}

/** Excel-friendly CSV (UTF-8 BOM). Opens cleanly in Excel. */
export async function exportExcelCsv<T extends Record<string, unknown>>(
  filename: string,
  columns: ExportColumn<T>[],
  rows: T[]
): Promise<string | null> {
  const escape = (s: string) => {
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = columns.map((c) => escape(c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => escape(cellValue(row[c.key]))).join(","));
  const csv = "\uFEFF" + [header, ...lines].join("\r\n");
  const name = `${filename}-${stamp()}.csv`;
  return saveBytes(name, textEncoder(csv), [
    { name: "Excel CSV", extensions: ["csv"] },
  ]);
}

function escHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Build an A4 HTML table for PDF print / save. */
export function buildExportPdfHtml<T extends Record<string, unknown>>(opts: {
  title: string;
  columns: ExportColumn<T>[];
  rows: T[];
  shopName?: string;
}): string {
  const head = opts.columns.map((c) => `<th>${escHtml(c.label)}</th>`).join("");
  const body = opts.rows
    .map(
      (row) =>
        `<tr>${opts.columns
          .map((c) => `<td>${escHtml(cellValue(row[c.key]))}</td>`)
          .join("")}</tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escHtml(opts.title)}</title>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; color: #111; margin: 24px; font-size: 12px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .sub { color: #555; margin-bottom: 14px; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; background: #f3f4f6; border: 1px solid #d1d5db; padding: 7px 8px; font-size: 10px; text-transform: uppercase; }
    td { border: 1px solid #e5e7eb; padding: 6px 8px; vertical-align: top; }
    @page { size: A4; margin: 12mm; }
  </style>
</head>
<body>
  <h1>${escHtml(opts.title)}</h1>
  <div class="sub">${escHtml(opts.shopName || "Agri Soft Pro")} · ${escHtml(new Date().toLocaleString())} · ${opts.rows.length} rows</div>
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>${body || `<tr><td colspan="${opts.columns.length}">No records</td></tr>`}</tbody>
  </table>
</body>
</html>`;
}

/** Save PDF as HTML file (open in browser → Print → Save as PDF). No popup window. */
export async function exportPdfFile<T extends Record<string, unknown>>(opts: {
  title: string;
  columns: ExportColumn<T>[];
  rows: T[];
  shopName?: string;
  filename?: string;
}): Promise<string | null> {
  const html = buildExportPdfHtml(opts);
  const name = `${opts.filename || "export"}-${stamp()}.html`;
  return saveBytes(name, textEncoder(html), [
    { name: "HTML (print to PDF)", extensions: ["html"] },
  ]);
}

/** @deprecated prefer exportPdfFile — kept for any callers using print window */
export async function exportPdfViaPrint<T extends Record<string, unknown>>(
  printHtml: (html: string) => Promise<ActionResult>,
  opts: { title: string; columns: ExportColumn<T>[]; rows: T[]; shopName?: string }
): Promise<string | null> {
  return exportPdfFile(opts);
}
