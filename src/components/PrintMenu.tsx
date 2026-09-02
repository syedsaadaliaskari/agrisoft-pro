"use client";

import { useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { htmlToPngBase64, pngBase64ToBlob } from "@/lib/html-to-png";
import type { ReceiptSize } from "@shared/ipc";

async function receiptImageFallback(
  html: string,
  size: ReceiptSize,
  mode: "save" | "whatsapp",
  fileName: string
) {
  const width = size === "a4" ? 860 : 340;
  const base64 = await htmlToPngBase64(html, width);
  const api = getApi();

  if (mode === "save") {
    if (typeof api.saveFile !== "function") {
      return { ok: false as const, error: "Restart the desktop app to save images" };
    }
    const res = await api.saveFile({
      defaultPath: `${fileName}.png`,
      dataBase64: base64,
      filters: [{ name: "PNG image", extensions: ["png"] }],
    });
    if (!res.ok) return res;
    return { ok: true as const, data: { path: res.data?.path ?? null } };
  }

  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBase64ToBlob(base64) })]);
  } catch {
    /* still try WhatsApp */
  }
  window.open("whatsapp://send", "_blank", "noopener,noreferrer");
  return { ok: true as const, data: { path: null, copied: true } };
}

type Props = {
  /** Used when getHtml is omitted (legacy). */
  onPrint?: (size: ReceiptSize) => void | Promise<void>;
  getHtml?: (size: ReceiptSize) => string | Promise<string>;
  fileName?: string;
  onError?: (message: string) => void;
  onNotice?: (message: string) => void;
  disabled?: boolean;
  label?: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary" | "ghost";
  defaultSize?: ReceiptSize;
};

/** Dropdown stays inside this control (no portal). */
export function PrintMenu({
  onPrint,
  getHtml,
  fileName = "receipt",
  onError,
  onNotice,
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
    setDropUp(spaceBelow < 220 && rect.top > 220);
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

  const htmlFor = async (receiptSize: ReceiptSize) => {
    if (!getHtml) return null;
    return getHtml(receiptSize);
  };

  const runPrint = async (receiptSize: ReceiptSize) => {
    setBusy(true);
    try {
      if (onPrint) {
        await onPrint(receiptSize);
      } else if (getHtml) {
        const html = await getHtml(receiptSize);
        const res = await getApi().printHtml(html);
        if (!res.ok) onError?.(res.error);
      }
      setOpen(false);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Print failed");
    } finally {
      setBusy(false);
    }
  };

  const runImage = async (mode: "save" | "whatsapp") => {
    if (!getHtml) return;
    setBusy(true);
    try {
      const html = await htmlFor(defaultSize);
      if (!html) return;
      const api = getApi();
      const native = typeof api.receiptImage === "function";
      const res = native
        ? await api.receiptImage({
            html,
            size: defaultSize,
            mode,
            defaultFileName: fileName,
          })
        : await receiptImageFallback(html, defaultSize, mode, fileName);
      if (!res.ok) {
        onError?.(res.error);
        return;
      }
      if (mode === "save") {
        if (res.data?.path) onNotice?.(`Saved ${res.data.path}`);
      } else {
        onNotice?.("Picture copied. Open the WhatsApp chat and paste.");
      }
      setOpen(false);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Could not save image");
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
        title="Print and share"
      >
        <Printer size={14} /> {busy ? "…" : label}
      </Button>
      {open ? (
        <div
          className={`absolute right-0 z-30 min-w-[190px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] shadow-xl ${
            dropUp ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--bg-soft)]"
            onClick={() => void runPrint("thermal")}
          >
            Thermal (80mm)
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--bg-soft)]"
            onClick={() => void runPrint("a4")}
          >
            A4 page
          </button>
          {getHtml ? (
            <>
              <button
                type="button"
                className="block w-full border-t border-[var(--border)] px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--bg-soft)]"
                onClick={() => void runImage("save")}
              >
                Save as image
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--bg-soft)]"
                onClick={() => void runImage("whatsapp")}
              >
                WhatsApp picture
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}
