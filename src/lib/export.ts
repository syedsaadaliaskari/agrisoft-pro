import type { ActionResult } from "@shared/ipc";

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

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

export function exportJson(filename: string, rows: unknown[]) {
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json;charset=utf-8" });
  downloadBlob(`${filename}-${stamp()}.json`, blob);
}

/** Excel-friendly CSV (UTF-8 BOM). Opens cleanly in Excel. */
export function exportExcelCsv<T extends Record<string, unknown>>(
  filename: string,
  columns: ExportColumn<T>[],
  rows: T[]
) {
  const escape = (s: string) => {
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = columns.map((c) => escape(c.label)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => escape(cellValue(row[c.key]))).join(",")
  );
  const csv = "\uFEFF" + [header, ...lines].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(`${filename}-${stamp()}.csv`, blob);
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

export async function exportPdfViaPrint<T extends Record<string, unknown>>(
  printHtml: (html: string) => Promise<ActionResult<void>>,
  opts: { title: string; columns: ExportColumn<T>[]; rows: T[]; shopName?: string }
): Promise<string | null> {
  const html = buildExportPdfHtml(opts);
  const res = await printHtml(html);
  if (!res.ok) return res.error;
  return null;
}
