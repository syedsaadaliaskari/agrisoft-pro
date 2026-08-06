"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/form";
import type { ReceiptSize } from "@shared/ipc";

type Props = {
  onPrint: (size: ReceiptSize) => void | Promise<void>;
  disabled?: boolean;
  label?: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary" | "ghost";
  defaultSize?: ReceiptSize;
};

type MenuPos = { top: number; left: number };

export function PrintMenu({
  onPrint,
  disabled,
  label = "Print",
  size = "sm",
  variant = "ghost",
  defaultSize = "thermal",
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPos(null);
      return;
    }
    const place = () => {
      const rect = anchorRef.current!.getBoundingClientRect();
      const menuWidth = 180;
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

  const run = async (receiptSize: ReceiptSize) => {
    setBusy(true);
    try {
      await onPrint(receiptSize);
      setOpen(false);
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
            className="min-w-[170px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] shadow-xl"
          >
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--bg-soft)]"
              onClick={() => void run("thermal")}
            >
              Thermal (80mm)
            </button>
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--bg-soft)]"
              onClick={() => void run("a4")}
            >
              A4 page
            </button>
            <button
              type="button"
              className="block w-full border-t border-[var(--border)] px-3 py-2 text-left text-xs text-[var(--text-muted)] hover:bg-[var(--bg-soft)]"
              onClick={() => void run(defaultSize)}
            >
              Quick print ({defaultSize === "a4" ? "A4" : "Thermal"})
            </button>
          </div>,
          document.body
        )
      : null;

  return (
    <span className="inline-flex" ref={anchorRef}>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled || busy}
        onClick={() => setOpen((v) => !v)}
        title="Print options"
      >
        <Printer size={14} /> {label}
      </Button>
      {menu}
    </span>
  );
}
