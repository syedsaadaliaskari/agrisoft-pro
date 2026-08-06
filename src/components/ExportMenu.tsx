"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

type MenuPos = { top: number; left: number };

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
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPos(null);
      return;
    }
    const place = () => {
      const rect = anchorRef.current!.getBoundingClientRect();
      const menuWidth = 160;
      const left = Math.min(
        Math.max(8, rect.right - menuWidth),
        window.innerWidth - menuWidth - 8
      );
      let top = rect.bottom + 4;
      const estimatedHeight = 120;
      if (top + estimatedHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - estimatedHeight - 4);
      }
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || menuRef.current?.contains(t)) return;
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

  const menu =
    open && mounted && pos
      ? createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
            className="min-w-[150px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] shadow-xl"
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
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative" ref={anchorRef}>
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
      {menu}
      {error ? <p className="mt-1 text-[11px] text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
