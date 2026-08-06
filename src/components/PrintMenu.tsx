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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

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
    <div className="relative inline-flex" ref={rootRef}>
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
        <div className="absolute right-0 z-30 mt-1 min-w-[170px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] shadow-xl">
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--bg-soft)]"
            onClick={() => void run("thermal")}
          >
            Thermal (80mm)
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--bg-soft)]"
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
    </div>
  );
}
