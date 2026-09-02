import { getApi } from "@/lib/api";
import { buildVoucherPrintHtml, type ReceiptSize } from "@/lib/print";
import type { Voucher } from "@shared/ipc";

async function shopBits() {
  const res = await getApi().getSettings();
  if (!res.ok) return {};
  const m = res.data;
  return {
    shopName: m.shop_name || null,
    shopAddress: m.shop_address || null,
    shopPhone: m.shop_phone || null,
    receiptFooter: m.receipt_footer || null,
    shopLogoDataUrl: m.shop_logo_data_url || null,
  };
}

export async function voucherPrintHtml(voucher: Voucher, size: ReceiptSize) {
  const shop = await shopBits();
  return buildVoucherPrintHtml({ ...voucher, ...shop }, size);
}
