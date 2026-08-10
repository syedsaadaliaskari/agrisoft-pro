"use client";

import { useState } from "react";
import { ScanBarcode } from "lucide-react";
import { getApi } from "@/lib/api";
import type { InventoryRow } from "@shared/ipc";

type Props = {
  onFound: (row: InventoryRow) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
};

/**
 * USB barcode scanners act as keyboards (digits + Enter).
 * Focus this field and scan — no cloud / special driver needed.
 */
export function BarcodeScanField({ onFound, onError, disabled }: Props) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const lookup = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed || busy || disabled) return;
    setBusy(true);
    const res = await getApi().findInventoryByBarcode(trimmed);
    setBusy(false);
    setValue("");
    if (!res.ok) {
      onError?.(res.error);
      return;
    }
    onFound(res.data);
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-[var(--text-muted)]">
        Scan barcode
      </label>
      <div className="relative">
        <ScanBarcode
          size={14}
          className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--accent)]"
        />
        <input
          value={value}
          disabled={disabled || busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void lookup(value);
            }
          }}
          placeholder={busy ? "Looking up…" : "Scan or type barcode + Enter"}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] py-2 pe-3 ps-9 text-sm outline-none ring-[var(--accent)] focus:ring-1 disabled:opacity-60"
          autoComplete="off"
        />
      </div>
    </div>
  );
}
