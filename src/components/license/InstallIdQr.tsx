"use client";

import QRCode from "react-qr-code";

type Props = {
  installId: string;
  size?: number;
};

/**
 * QR encodes the Install ID as plain text only (no URL).
 * Phone Camera / Google Lens will reveal the ID for copy-send to vendor.
 */
export function InstallIdQr({ installId, size = 196 }: Props) {
  return (
    <div
      className="inline-flex rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm"
      aria-label={`QR code for Install ID ${installId}`}
    >
      <QRCode
        value={installId}
        size={size}
        level="M"
        bgColor="#ffffff"
        fgColor="#0f1720"
        style={{ height: "auto", maxWidth: "100%", width: "100%" }}
      />
    </div>
  );
}
