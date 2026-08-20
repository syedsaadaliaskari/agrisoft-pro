import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { accounts, voucherEntries, vouchers } from "../db/schema";
import { supabaseUpsert, tenantId } from "./client";
import { fetchTenantRows, type SyncCounts } from "./pull";
import { isNewer } from "./store";

export async function syncVouchers(): Promise<SyncCounts> {
  const tid = tenantId();
  const db = getDb();
  const accountIds = new Set(db.select().from(accounts).all().map((a) => a.id));

  const local = db.select().from(vouchers).all();
  const pushed = await supabaseUpsert(
    "vouchers",
    local.map((row) => ({
      id: row.id,
      tenant_id: tid,
      voucher_no: row.voucherNo,
      voucher_type: row.voucherType,
      voucher_date: row.voucherDate,
      party_type: row.partyType,
      party_id: row.partyId,
      account_id: row.accountId && accountIds.has(row.accountId) ? row.accountId : null,
      reference_no: row.referenceNo,
      notes: row.notes,
      subtotal: row.subtotal,
      discount_amount: row.discountAmount,
      addition_amount: row.additionAmount,
      tax_amount: row.taxAmount,
      grand_total: row.grandTotal,
      paid_amount: row.paidAmount,
      status: row.status,
      created_by: null,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      deleted_at: null,
    }))
  );

  let pulled = 0;
  for (const row of await fetchTenantRows<{
    id: string;
    voucher_no: string;
    voucher_type: string;
    voucher_date: string;
    party_type: string | null;
    party_id: string | null;
    account_id: string | null;
    reference_no: string | null;
    notes: string | null;
    subtotal: number;
    discount_amount: number;
    addition_amount: number;
    tax_amount: number;
    grand_total: number;
    paid_amount: number;
    status: string;
    created_at: string;
    updated_at: string;
  }>("vouchers")) {
    const existing = db.select().from(vouchers).where(eq(vouchers.id, row.id)).get();
    const mapped = {
      id: row.id,
      voucherNo: row.voucher_no,
      voucherType: row.voucher_type,
      voucherDate: row.voucher_date,
      partyType: row.party_type,
      partyId: row.party_id,
      accountId: row.account_id && accountIds.has(row.account_id) ? row.account_id : null,
      referenceNo: row.reference_no,
      notes: row.notes,
      subtotal: Number(row.subtotal || 0),
      discountAmount: Number(row.discount_amount || 0),
      additionAmount: Number(row.addition_amount || 0),
      taxAmount: Number(row.tax_amount || 0),
      grandTotal: Number(row.grand_total || 0),
      paidAmount: Number(row.paid_amount || 0),
      status: row.status || "posted",
      createdBy: null as string | null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    if (!existing) {
      db.insert(vouchers).values(mapped).run();
      pulled += 1;
    } else if (isNewer(row.updated_at, existing.updatedAt)) {
      db.update(vouchers).set(mapped).where(eq(vouchers.id, row.id)).run();
      pulled += 1;
    }
  }

  const localEntries = db.select().from(voucherEntries).all();
  const stamp = new Date().toISOString();
  await supabaseUpsert(
    "voucher_entries",
    localEntries
      .filter((row) => accountIds.has(row.accountId))
      .map((row) => ({
        id: row.id,
        tenant_id: tid,
        voucher_id: row.voucherId,
        account_id: row.accountId,
        debit: row.debit,
        credit: row.credit,
        narration: row.narration,
        line_order: row.lineOrder,
        created_at: stamp,
        updated_at: stamp,
        deleted_at: null,
      }))
  );

  const remoteEntries = await fetchTenantRows<{
    id: string;
    voucher_id: string;
    account_id: string;
    debit: number;
    credit: number;
    narration: string | null;
    line_order: number;
  }>("voucher_entries");

  for (const row of remoteEntries) {
    const voucher = db.select().from(vouchers).where(eq(vouchers.id, row.voucher_id)).get();
    const account = db.select().from(accounts).where(eq(accounts.id, row.account_id)).get();
    if (!voucher || !account) continue;
    const existing = db.select().from(voucherEntries).where(eq(voucherEntries.id, row.id)).get();
    const mapped = {
      id: row.id,
      voucherId: row.voucher_id,
      accountId: row.account_id,
      debit: Number(row.debit || 0),
      credit: Number(row.credit || 0),
      narration: row.narration,
      lineOrder: Number(row.line_order || 0),
    };
    if (!existing) {
      db.insert(voucherEntries).values(mapped).run();
    } else {
      db.update(voucherEntries).set(mapped).where(eq(voucherEntries.id, row.id)).run();
    }
  }

  return { pushed, pulled };
}
