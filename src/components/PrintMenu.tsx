"use client";

import { useEffect, useRef, useState } from "react";
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

/** Dropdown stays inside this control (no portal). */
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
  const [dropUp, setDropUp] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

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

  const run = async (receiptSize: ReceiptSize) => {
    setBusy(true);
    try {
      await onPrint(receiptSize);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="relative z-20 inline-flex" ref={rootRef}>
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
      {open ? (
        <div
          className={`absolute right-0 z-30 min-w-[170px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] shadow-xl ${
            dropUp ? "bottom-full mb-1" : "top-full mt-1"
          }`}
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
        </div>
      ) : null}
    </span>
  );
}
