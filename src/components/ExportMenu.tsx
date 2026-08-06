"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import {
  exportExcelCsv,
  exportJson,
  exportPdfViaPrint,
  type ExportColumn,
} from "@/lib/export";

type Props<T extends Record<string, unknown>> = {
  filename: string;
  title: string;
  columns: ExportColumn<T>[];
  rows: T[];
  disabled?: boolean;
};

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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const run = async (kind: "json" | "excel" | "pdf") => {
    setError("");
    if (!rows.length) {
      setError("Nothing to export");
      return;
    }
    setBusy(true);
    try {
      if (kind === "json") exportJson(filename, rows);
      else if (kind === "excel") exportExcelCsv(filename, columns, rows);
      else {
        const err = await exportPdfViaPrint((html) => getApi().printHtml(html), {
          title,
          columns,
          rows,
        });
        if (err) setError(err);
      }
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={rootRef}>
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
        <div className="absolute right-0 z-30 mt-1 min-w-[150px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] shadow-xl">
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--bg-soft)]"
            onClick={() => void run("json")}
          >
            JSON
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--bg-soft)]"
            onClick={() => void run("excel")}
          >
            Excel (CSV)
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--bg-soft)]"
            onClick={() => void run("pdf")}
          >
            PDF
          </button>
        </div>
      ) : null}
      {error ? <p className="absolute right-0 top-full mt-1 text-[11px] text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
