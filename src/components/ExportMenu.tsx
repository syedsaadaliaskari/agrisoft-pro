"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/form";
import {
  exportExcelCsv,
  exportJson,
  exportPdfFile,
  type ExportColumn,
} from "@/lib/export";

type Props<T extends Record<string, unknown>> = {
  filename: string;
  title: string;
  columns: ExportColumn<T>[];
  rows: T[];
  disabled?: boolean;
};

/** Dropdown stays inside this component (no portal) so it never floats outside the card. */
export function ExportMenu<T extends Record<string, unknown>>({
  filename,
  title,
  columns,
  rows,
  disabled,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dropUp, setDropUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setDropUp(spaceBelow < 140 && rect.top > 140);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = async (kind: "json" | "excel" | "pdf") => {
    setError("");
    if (!rows.length) {
      setError("Nothing to export");
      return;
    }
    setBusy(true);
    try {
      let err: string | null = null;
      if (kind === "json") err = await exportJson(filename, rows);
      else if (kind === "excel") err = await exportExcelCsv(filename, columns, rows);
      else err = await exportPdfFile({ title, columns, rows, filename });
      if (err) setError(err);
      else setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative z-20 inline-block" ref={rootRef}>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled || busy}
        onClick={() => setOpen((v) => !v)}
        title="Export list"
      >
        <Download size={14} /> Export
      </Button>
      {open ? (
        <div
          className={`absolute right-0 z-30 min-w-[150px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] shadow-xl ${
            dropUp ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--bg-soft)]"
            onClick={() => void run("json")}
          >
            JSON
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--bg-soft)]"
            onClick={() => void run("excel")}
          >
            Excel (CSV)
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--bg-soft)]"
            onClick={() => void run("pdf")}
          >
            PDF (HTML)
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-1 text-[11px] text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
