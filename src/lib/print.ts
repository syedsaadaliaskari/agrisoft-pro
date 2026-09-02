import type { Purchase, PurchaseReturn, ReceiptSize, Sale, SaleReturn, Voucher } from "@shared/ipc";

export type { ReceiptSize };

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n: number, currency = "Rs") {
  return `${currency} ${Number(n || 0).toFixed(2)}`;
}

/** Qty on print matches the screen: `5 kg`. Blank unit stays qty-only. */
function qtyLabel(quantity: number, unit?: string | null) {
  const u = (unit ?? "").trim();
  return u ? `${quantity} ${esc(u)}` : String(quantity);
}

function baseStyles(size: ReceiptSize) {
  if (size === "thermal") {
    return `
      * { box-sizing: border-box; }
      body { font-family: "Segoe UI", Arial, sans-serif; color: #111; margin: 0; padding: 10px; width: 280px; font-size: 11px; }
      h1 { font-size: 14px; margin: 0 0 2px; text-align: center; }
      .logo { display: block; max-height: 48px; max-width: 120px; margin: 0 auto 6px; object-fit: contain; }
      .sub { text-align: center; font-size: 10px; color: #444; margin-bottom: 8px; line-height: 1.35; }
      .meta { margin-bottom: 8px; }
      .meta div { display: flex; justify-content: space-between; gap: 6px; margin: 2px 0; }
      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; border-bottom: 1px solid #222; padding: 3px 1px; font-size: 10px; }
      td { padding: 4px 1px; border-bottom: 1px dashed #ccc; vertical-align: top; }
      .num { text-align: right; white-space: nowrap; }
      .muted { color: #666; font-size: 9px; }
      .totals { margin-top: 8px; }
      .totals div { display: flex; justify-content: space-between; margin: 2px 0; }
      .grand { font-weight: 700; font-size: 12px; border-top: 1px solid #222; padding-top: 5px; margin-top: 5px; }
      .footer { text-align: center; margin-top: 10px; font-size: 10px; color: #444; }
      .badge { text-align: center; font-size: 10px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.04em; }
      @page { size: 80mm auto; margin: 4mm; }
    `;
  }

  return `
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", Arial, sans-serif; color: #111; margin: 0; padding: 24px 28px; font-size: 13px; }
    .sheet { max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; }
    .brand h1 { font-size: 22px; margin: 0 0 4px; }
    .brand .logo { display: block; max-height: 64px; max-width: 160px; margin-bottom: 8px; object-fit: contain; }
    .brand .sub { color: #444; font-size: 12px; line-height: 1.4; }
    .doc-title { text-align: right; }
    .doc-title .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #555; }
    .doc-title .no { font-size: 18px; font-weight: 700; margin-top: 4px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 18px; font-size: 13px; }
    .meta-grid .k { color: #555; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th { text-align: left; background: #f3f4f6; border: 1px solid #d1d5db; padding: 8px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
    td { border: 1px solid #e5e7eb; padding: 8px 10px; vertical-align: top; }
    .num { text-align: right; white-space: nowrap; }
    .muted { color: #666; font-size: 11px; }
    .totals-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
    .totals { width: 280px; }
    .totals div { display: flex; justify-content: space-between; margin: 4px 0; }
    .grand { font-weight: 700; font-size: 15px; border-top: 2px solid #111; padding-top: 8px; margin-top: 8px; }
    .footer { margin-top: 28px; text-align: center; color: #555; font-size: 12px; border-top: 1px dashed #ccc; padding-top: 12px; }
    @page { size: A4; margin: 12mm; }
  `;
}

function wrap(title: string, size: ReceiptSize, body: string) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <style>${baseStyles(size)}</style>
</head>
<body>${body}</body>
</html>`;
}

type ShopBits = {
  shopName?: string | null;
  shopAddress?: string | null;
  shopPhone?: string | null;
  receiptFooter?: string | null;
  shopLogoDataUrl?: string | null;
};

function shopBlock(shop: ShopBits, size: ReceiptSize) {
  const name = shop.shopName || "Agri Soft Pro";
  const addr = shop.shopAddress || "";
  const phone = shop.shopPhone || "";
  const logo = shop.shopLogoDataUrl
    ? `<img class="logo" src="${shop.shopLogoDataUrl}" alt="" />`
    : "";
  if (size === "thermal") {
    return `${logo}<h1>${esc(name)}</h1><div class="sub">${esc(addr)}${addr && phone ? "<br/>" : ""}${esc(phone)}</div>`;
  }
  return `<div class="brand">${logo}<h1>${esc(name)}</h1><div class="sub">${esc(addr)}${addr && phone ? "<br/>" : ""}${esc(phone)}</div></div>`;
}

export function buildSalePrintHtml(sale: Sale, size: ReceiptSize = "thermal", currency = "Rs"): string {
  const items = sale.items ?? [];
  const rows = items
    .map(
      (it) => `<tr>
      <td>${esc(it.productName)}<div class="muted">${esc([it.size, it.color].filter(Boolean).join(" / "))}</div></td>
      <td class="num">${qtyLabel(it.quantity, it.unit)}</td>
      <td class="num">${it.unitPrice.toFixed(2)}</td>
      <td class="num">${it.lineTotal.toFixed(2)}</td>
    </tr>`
    )
    .join("");

  const totals = `
    <div><span>Subtotal</span><span>${money(sale.subtotal, currency)}</span></div>
    <div><span>Discount</span><span>${money(sale.discountAmount, currency)}</span></div>
    <div><span>Additions</span><span>${money(sale.additionAmount, currency)}</span></div>
    <div><span>Tax</span><span>${money(sale.taxAmount, currency)}</span></div>
    <div class="grand"><span>Grand total</span><span>${money(sale.grandTotal, currency)}</span></div>
    <div><span>Paid</span><span>${money(sale.paidAmount, currency)}</span></div>
    <div><span>Receivable</span><span>${money(sale.grandTotal - sale.paidAmount, currency)}</span></div>`;

  if (size === "thermal") {
    return wrap(
      sale.invoiceNo,
      size,
      `${shopBlock(sale, size)}
      <div class="badge">Sale invoice</div>
      <div class="meta">
        <div><span>Invoice</span><strong>${esc(sale.invoiceNo)}</strong></div>
        <div><span>Date</span><span>${esc(sale.invoiceDate)}</span></div>
        <div><span>Customer</span><span>${esc(sale.customerName || "Walk-in")}</span></div>
        <div><span>Payment</span><span>${esc(sale.paymentMode)}</span></div>
      </div>
      <table>
        <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amt</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totals">${totals}</div>
      <div class="footer">${esc(sale.receiptFooter || "Thank you!")}</div>`
    );
  }

  return wrap(
    sale.invoiceNo,
    size,
    `<div class="sheet">
      <div class="header">
        ${shopBlock(sale, size)}
        <div class="doc-title"><div class="label">Sale invoice</div><div class="no">${esc(sale.invoiceNo)}</div></div>
      </div>
      <div class="meta-grid">
        <div><div class="k">Date</div><div>${esc(sale.invoiceDate)}</div></div>
        <div><div class="k">Customer</div><div>${esc(sale.customerName || "Walk-in")}</div></div>
        <div><div class="k">Payment</div><div style="text-transform:capitalize">${esc(sale.paymentMode)}</div></div>
        <div><div class="k">Status</div><div style="text-transform:capitalize">${esc(sale.status)}</div></div>
      </div>
      <table>
        <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4">No lines</td></tr>`}</tbody>
      </table>
      <div class="totals-wrap"><div class="totals">${totals}</div></div>
      <div class="footer">${esc(sale.receiptFooter || "Thank you for your business.")}</div>
    </div>`
  );
}

export function buildPurchasePrintHtml(
  purchase: Purchase & ShopBits,
  size: ReceiptSize = "a4",
  currency = "Rs"
): string {
  const items = purchase.items ?? [];
  const rows = items
    .map(
      (it) => `<tr>
      <td>${esc(it.productName)}<div class="muted">${esc([it.size, it.color].filter(Boolean).join(" / "))}</div></td>
      <td class="num">${qtyLabel(it.quantity, it.unit)}</td>
      <td class="num">${it.unitCost.toFixed(2)}</td>
      <td class="num">${it.lineTotal.toFixed(2)}</td>
    </tr>`
    )
    .join("");

  const totals = `
    <div><span>Subtotal</span><span>${money(purchase.subtotal, currency)}</span></div>
    <div><span>Discount</span><span>${money(purchase.discountAmount, currency)}</span></div>
    <div><span>Additions</span><span>${money(purchase.additionAmount, currency)}</span></div>
    <div><span>Tax</span><span>${money(purchase.taxAmount, currency)}</span></div>
    <div class="grand"><span>Grand total</span><span>${money(purchase.grandTotal, currency)}</span></div>
    <div><span>Paid</span><span>${money(purchase.paidAmount, currency)}</span></div>
    <div><span>Payable</span><span>${money(purchase.grandTotal - purchase.paidAmount, currency)}</span></div>`;

  if (size === "thermal") {
    return wrap(
      purchase.invoiceNo,
      size,
      `${shopBlock(purchase, size)}
      <div class="badge">Purchase</div>
      <div class="meta">
        <div><span>Invoice</span><strong>${esc(purchase.invoiceNo)}</strong></div>
        <div><span>Date</span><span>${esc(purchase.invoiceDate)}</span></div>
        <div><span>Vendor</span><span>${esc(purchase.vendorName || "-")}</span></div>
        <div><span>Payment</span><span>${esc(purchase.paymentMode)}</span></div>
      </div>
      <table>
        <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Cost</th><th class="num">Amt</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totals">${totals}</div>
      <div class="footer">${esc(purchase.receiptFooter || "")}</div>`
    );
  }

  return wrap(
    purchase.invoiceNo,
    size,
    `<div class="sheet">
      <div class="header">
        ${shopBlock(purchase, size)}
        <div class="doc-title"><div class="label">Purchase invoice</div><div class="no">${esc(purchase.invoiceNo)}</div></div>
      </div>
      <div class="meta-grid">
        <div><div class="k">Date</div><div>${esc(purchase.invoiceDate)}</div></div>
        <div><div class="k">Vendor</div><div>${esc(purchase.vendorName || "-")}</div></div>
        <div><div class="k">Payment</div><div style="text-transform:capitalize">${esc(purchase.paymentMode)}</div></div>
        <div><div class="k">Status</div><div style="text-transform:capitalize">${esc(purchase.status)}</div></div>
      </div>
      <table>
        <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Cost</th><th class="num">Amount</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4">No lines</td></tr>`}</tbody>
      </table>
      <div class="totals-wrap"><div class="totals">${totals}</div></div>
      <div class="footer">${esc(purchase.receiptFooter || "Purchase record")}</div>
    </div>`
  );
}

export function buildSaleReturnPrintHtml(
  doc: SaleReturn & ShopBits,
  size: ReceiptSize = "thermal",
  currency = "Rs"
): string {
  const items = doc.items ?? [];
  const rows = items
    .map(
      (it) => `<tr>
      <td>Variant ${esc(it.variantId.slice(0, 8))}</td>
      <td class="num">${qtyLabel(it.quantity, it.unit)}</td>
      <td class="num">${it.unitPrice.toFixed(2)}</td>
      <td class="num">${it.lineTotal.toFixed(2)}</td>
    </tr>`
    )
    .join("");

  const totals = `
    <div><span>Subtotal</span><span>${money(doc.subtotal, currency)}</span></div>
    <div><span>Tax</span><span>${money(doc.taxAmount, currency)}</span></div>
    <div class="grand"><span>Grand total</span><span>${money(doc.grandTotal, currency)}</span></div>`;

  const body =
    size === "thermal"
      ? `${shopBlock(doc, size)}
      <div class="badge">Sale return</div>
      <div class="meta">
        <div><span>Return</span><strong>${esc(doc.returnNo)}</strong></div>
        <div><span>Date</span><span>${esc(doc.returnDate)}</span></div>
        <div><span>Customer</span><span>${esc(doc.customerName || "Walk-in")}</span></div>
      </div>
      <table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amt</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="totals">${totals}</div>`
      : `<div class="sheet">
      <div class="header">${shopBlock(doc, size)}<div class="doc-title"><div class="label">Sale return</div><div class="no">${esc(doc.returnNo)}</div></div></div>
      <div class="meta-grid">
        <div><div class="k">Date</div><div>${esc(doc.returnDate)}</div></div>
        <div><div class="k">Customer</div><div>${esc(doc.customerName || "Walk-in")}</div></div>
      </div>
      <table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="totals-wrap"><div class="totals">${totals}</div></div>
    </div>`;

  return wrap(doc.returnNo, size, body);
}

export function buildPurchaseReturnPrintHtml(
  doc: PurchaseReturn & ShopBits,
  size: ReceiptSize = "a4",
  currency = "Rs"
): string {
  const items = doc.items ?? [];
  const rows = items
    .map(
      (it) => `<tr>
      <td>Variant ${esc(it.variantId.slice(0, 8))}</td>
      <td class="num">${qtyLabel(it.quantity, it.unit)}</td>
      <td class="num">${it.unitCost.toFixed(2)}</td>
      <td class="num">${it.lineTotal.toFixed(2)}</td>
    </tr>`
    )
    .join("");

  const totals = `
    <div><span>Subtotal</span><span>${money(doc.subtotal, currency)}</span></div>
    <div><span>Tax</span><span>${money(doc.taxAmount, currency)}</span></div>
    <div class="grand"><span>Grand total</span><span>${money(doc.grandTotal, currency)}</span></div>`;

  const body =
    size === "thermal"
      ? `${shopBlock(doc, size)}
      <div class="badge">Purchase return</div>
      <div class="meta">
        <div><span>Return</span><strong>${esc(doc.returnNo)}</strong></div>
        <div><span>Date</span><span>${esc(doc.returnDate)}</span></div>
        <div><span>Vendor</span><span>${esc(doc.vendorName || "-")}</span></div>
      </div>
      <table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Cost</th><th class="num">Amt</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="totals">${totals}</div>`
      : `<div class="sheet">
      <div class="header">${shopBlock(doc, size)}<div class="doc-title"><div class="label">Purchase return</div><div class="no">${esc(doc.returnNo)}</div></div></div>
      <div class="meta-grid">
        <div><div class="k">Date</div><div>${esc(doc.returnDate)}</div></div>
        <div><div class="k">Vendor</div><div>${esc(doc.vendorName || "-")}</div></div>
      </div>
      <table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Cost</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="totals-wrap"><div class="totals">${totals}</div></div>
    </div>`;

  return wrap(doc.returnNo, size, body);
}

export function buildVoucherPrintHtml(
  voucher: Voucher & ShopBits,
  size: ReceiptSize = "a4",
  currency = "Rs"
): string {
  const entries = voucher.entries ?? [];
  const rows = entries
    .map(
      (e) => `<tr>
      <td>${esc(e.accountCode || "")} ${esc(e.accountName || "")}<div class="muted">${esc(e.narration || "")}</div></td>
      <td class="num">${e.debit ? e.debit.toFixed(2) : ""}</td>
      <td class="num">${e.credit ? e.credit.toFixed(2) : ""}</td>
    </tr>`
    )
    .join("");

  const debit = entries.reduce((s, e) => s + e.debit, 0);
  const credit = entries.reduce((s, e) => s + e.credit, 0);

  const body =
    size === "thermal"
      ? `${shopBlock(voucher, size)}
      <div class="badge">${esc(voucher.voucherType.replace(/_/g, " "))}</div>
      <div class="meta">
        <div><span>No</span><strong>${esc(voucher.voucherNo)}</strong></div>
        <div><span>Date</span><span>${esc(voucher.voucherDate)}</span></div>
        <div><span>Party</span><span>${esc(voucher.partyName || "-")}</span></div>
      </div>
      <table><thead><tr><th>Account</th><th class="num">Dr</th><th class="num">Cr</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="totals">
        <div class="grand"><span>Total</span><span>${money(debit, currency)} / ${money(credit, currency)}</span></div>
      </div>`
      : `<div class="sheet">
      <div class="header">${shopBlock(voucher, size)}<div class="doc-title"><div class="label">${esc(voucher.voucherType.replace(/_/g, " "))} voucher</div><div class="no">${esc(voucher.voucherNo)}</div></div></div>
      <div class="meta-grid">
        <div><div class="k">Date</div><div>${esc(voucher.voucherDate)}</div></div>
        <div><div class="k">Party</div><div>${esc(voucher.partyName || "-")}</div></div>
        <div><div class="k">Reference</div><div>${esc(voucher.referenceNo || "-")}</div></div>
        <div><div class="k">Status</div><div style="text-transform:capitalize">${esc(voucher.status)}</div></div>
      </div>
      <table><thead><tr><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="totals-wrap"><div class="totals">
        <div class="grand"><span>Totals</span><span>${money(debit, currency)} / ${money(credit, currency)}</span></div>
      </div></div>
      ${voucher.notes ? `<div class="footer">${esc(voucher.notes)}</div>` : ""}
    </div>`;

  return wrap(voucher.voucherNo, size, body);
}

/** Generic list / report print (A4 by default; thermal uses compact table). */
export function buildListPrintHtml(opts: {
  title: string;
  subtitle?: string;
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
  size?: ReceiptSize;
  shopName?: string;
}): string {
  const size = opts.size ?? "a4";
  const cols = opts.columns;
  const head = cols.map((c) => `<th>${esc(c.label)}</th>`).join("");
  const bodyRows = opts.rows
    .map(
      (row) =>
        `<tr>${cols
          .map((c) => {
            const v = row[c.key];
            const text = v == null ? "" : String(v);
            return `<td>${esc(text)}</td>`;
          })
          .join("")}</tr>`
    )
    .join("");

  const body =
    size === "thermal"
      ? `<h1>${esc(opts.title)}</h1>
        <div class="sub">${esc(opts.subtitle || opts.shopName || "")}</div>
        <table><thead><tr>${head}</tr></thead><tbody>${bodyRows}</tbody></table>`
      : `<div class="sheet">
        <div class="header">
          <div class="brand"><h1>${esc(opts.shopName || "Agri Soft Pro")}</h1><div class="sub">${esc(opts.subtitle || "")}</div></div>
          <div class="doc-title"><div class="label">Report</div><div class="no">${esc(opts.title)}</div></div>
        </div>
        <table><thead><tr>${head}</tr></thead><tbody>${bodyRows || `<tr><td colspan="${cols.length}">No records</td></tr>`}</tbody></table>
      </div>`;

  return wrap(opts.title, size, body);
}

/** @deprecated use buildSalePrintHtml */
export function buildSaleReceiptHtml(sale: Sale, currency = "Rs"): string {
  return buildSalePrintHtml(sale, "thermal", currency);
}
