import type { Sale } from "@shared/ipc";

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildSaleReceiptHtml(sale: Sale, currency = "Rs"): string {
  const items = sale.items ?? [];
  const rows = items
    .map(
      (it) => `
      <tr>
        <td>${esc(it.productName)}<div class="muted">${esc(it.size ?? "")} / ${esc(it.color ?? "")}</div></td>
        <td class="num">${it.quantity}</td>
        <td class="num">${it.unitPrice.toFixed(2)}</td>
        <td class="num">${it.lineTotal.toFixed(2)}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(sale.invoiceNo)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", Arial, sans-serif; color: #111; margin: 0; padding: 16px; width: 360px; }
    h1 { font-size: 16px; margin: 0 0 4px; text-align: center; }
    .sub { text-align: center; font-size: 11px; color: #444; margin-bottom: 12px; }
    .meta { font-size: 12px; margin-bottom: 10px; }
    .meta div { display: flex; justify-content: space-between; gap: 8px; margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; border-bottom: 1px solid #222; padding: 4px 2px; font-size: 11px; }
    td { padding: 5px 2px; border-bottom: 1px dashed #ccc; vertical-align: top; }
    .num { text-align: right; white-space: nowrap; }
    .muted { color: #666; font-size: 10px; }
    .totals { margin-top: 10px; font-size: 12px; }
    .totals div { display: flex; justify-content: space-between; margin: 3px 0; }
    .grand { font-weight: 700; font-size: 14px; border-top: 1px solid #222; padding-top: 6px; margin-top: 6px; }
    .footer { text-align: center; margin-top: 14px; font-size: 11px; color: #444; }
  </style>
</head>
<body>
  <h1>${esc(sale.shopName || "Agri Soft Pro")}</h1>
  <div class="sub">
    ${esc(sale.shopAddress || "")}<br/>
    ${esc(sale.shopPhone || "")}
  </div>
  <div class="meta">
    <div><span>Invoice</span><strong>${esc(sale.invoiceNo)}</strong></div>
    <div><span>Date</span><span>${esc(sale.invoiceDate)}</span></div>
    <div><span>Customer</span><span>${esc(sale.customerName || "Walk-in")}</span></div>
    <div><span>Payment</span><span>${esc(sale.paymentMode)}</span></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th class="num">Qty</th>
        <th class="num">Rate</th>
        <th class="num">Amt</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>${currency} ${sale.subtotal.toFixed(2)}</span></div>
    <div><span>Discount</span><span>${currency} ${sale.discountAmount.toFixed(2)}</span></div>
    <div><span>Additions</span><span>${currency} ${sale.additionAmount.toFixed(2)}</span></div>
    <div><span>Tax</span><span>${currency} ${sale.taxAmount.toFixed(2)}</span></div>
    <div class="grand"><span>Grand total</span><span>${currency} ${sale.grandTotal.toFixed(2)}</span></div>
    <div><span>Paid</span><span>${currency} ${sale.paidAmount.toFixed(2)}</span></div>
    <div><span>Balance</span><span>${currency} ${(sale.grandTotal - sale.paidAmount).toFixed(2)}</span></div>
  </div>
  <div class="footer">${esc(sale.receiptFooter || "Thank you!")}</div>
</body>
</html>`;
}
