"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Trash2, Truck, Warehouse } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import {
  OpsEmptyState,
  OpsListSkeleton,
  OpsStatStrip,
  VoucherWorkspace,
  money,
} from "@/components/ops/DocumentWorkspace";
import {
  Alert,
  Button,
  Checkbox,
  DataTable,
  Input,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui/form";
import { getApi } from "@/lib/api";
import type { Vendor } from "@shared/ipc";

const emptyForm = {
  code: "",
  name: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  openingBalance: "0",
  balanceType: "credit",
  isActive: true,
};

export default function VendorsPage() {
  const [rows, setRows] = useState<Vendor[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await getApi().listVendors();
    if (!res.ok) setError(res.error);
    else setRows(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const active = rows.filter((r) => r.isActive);
    const opening = active.reduce((s, r) => s + (r.openingBalance || 0), 0);
    return {
      total: rows.length,
      active: active.length,
      opening,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        (r.phone ?? "").toLowerCase().includes(q) ||
        (r.city ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const resetForm = () => {
    setEditing(null);
    setForm(emptyForm);
    setError("");
  };

  const openEdit = (row: Vendor) => {
    setEditing(row);
    setForm({
      code: row.code,
      name: row.name,
      phone: row.phone ?? "",
      email: row.email ?? "",
      address: row.address ?? "",
      city: row.city ?? "",
      openingBalance: String(row.openingBalance),
      balanceType: row.balanceType,
      isActive: row.isActive,
    });
    setError("");
    setOkMsg("");
  };

  const onSave = async () => {
    setSaving(true);
    setError("");
    setOkMsg("");
    const payload = {
      code: form.code || undefined,
      name: form.name,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      city: form.city || null,
      openingBalance: Number(form.openingBalance),
      balanceType: form.balanceType as "debit" | "credit",
      isActive: form.isActive,
    };
    const api = getApi();
    const res = editing ? await api.updateVendor(editing.id, payload) : await api.createVendor(payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOkMsg(editing ? `Updated ${res.data.code}` : `Saved ${res.data.code}`);
    resetForm();
    await load();
  };

  const onDelete = async (row: Vendor) => {
    if (!confirm(`Delete vendor "${row.name}"?`)) return;
    const res = await getApi().deleteVendor(row.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (editing?.id === row.id) resetForm();
    await load();
  };

  return (
    <AppShell title="Vendors" subtitle="Suppliers and payables parties" permission="vendors.view">
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {okMsg ? (
        <div className="mb-4">
          <Alert tone="info">{okMsg}</Alert>
        </div>
      ) : null}

      <VoucherWorkspace
        formTitle={editing ? "Edit vendor" : "New vendor"}
        formHint="Party master for purchases, payments, and payables"
        stats={
          <OpsStatStrip
            items={[
              {
                label: "Vendors",
                value: String(stats.total),
                hint: `${stats.active} active`,
                tone: "accent",
                icon: Truck,
              },
              {
                label: "Opening balances",
                value: money(stats.opening),
                hint: "Across active suppliers",
                icon: Warehouse,
              },
            ]}
          />
        }
        form={
          <>
            <Input
              label="Code"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            />
            <Input
              label="Name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
              <Input
                label="City"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </div>
            <Input
              label="Email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <Textarea
              label="Address"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
            <Select
              label="Opening balance type"
              value={form.balanceType}
              onChange={(e) => setForm((f) => ({ ...f, balanceType: e.target.value }))}
              options={[
                { value: "credit", label: "Credit (we owe)" },
                { value: "debit", label: "Debit (vendor owes)" },
              ]}
            />
            <Input
              label="Opening balance"
              type="number"
              min={0}
              step="0.01"
              value={form.openingBalance}
              onChange={(e) => setForm((f) => ({ ...f, openingBalance: e.target.value }))}
            />
            <Checkbox
              label="Active"
              checked={form.isActive}
              onChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
            />
            <div className="flex flex-wrap gap-2 pt-1">
              {editing ? (
                <Button variant="secondary" onClick={resetForm}>
                  Cancel edit
                </Button>
              ) : null}
              <Button onClick={() => void onSave()} disabled={saving || !form.name.trim()}>
                {saving ? "Saving..." : editing ? "Update vendor" : "Save vendor"}
              </Button>
            </div>
          </>
        }
        listTitle="Vendor register"
        list={
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-1"
              />
              <ExportMenu
                filename="vendors"
                title="Vendors"
                columns={[
                  { key: "code", label: "Code" },
                  { key: "name", label: "Name" },
                  { key: "phone", label: "Phone" },
                  { key: "city", label: "City" },
                  { key: "opening", label: "Opening" },
                  { key: "status", label: "Status" },
                ]}
                rows={filtered.map((r) => ({
                  code: r.code,
                  name: r.name,
                  phone: r.phone ?? "",
                  city: r.city ?? "",
                  opening: `${r.openingBalance} ${r.balanceType === "debit" ? "Dr" : "Cr"}`,
                  status: r.isActive ? "Active" : "Inactive",
                }))}
              />
            </div>
            {loading ? (
              <OpsListSkeleton rows={6} />
            ) : filtered.length === 0 ? (
              <OpsEmptyState
                title={search ? "No matching vendors" : "No vendors yet"}
                hint="Add a supplier on the left — they will appear here for purchases and payments."
              />
            ) : (
              <DataTable headers={["Party", "Contact", "Opening", "Status", ""]} empty={false}>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="group border-b border-[var(--border)] last:border-0 transition hover:bg-[var(--bg-soft)]/60"
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-medium">{row.name}</div>
                      <div className="font-mono text-[11px] text-[var(--text-muted)]">{row.code}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-sm">{row.phone || "—"}</div>
                      <div className="text-[11px] text-[var(--text-muted)]">{row.city || "—"}</div>
                    </td>
                    <td className="px-4 py-3.5 tabular-nums text-sm">
                      {money(row.openingBalance)}{" "}
                      <span className="text-[var(--text-muted)]">
                        {row.balanceType === "debit" ? "Dr" : "Cr"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge active={row.isActive} />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex justify-end gap-0.5">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(row)} title="Edit">
                          <Pencil size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void onDelete(row)}
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </div>
        }
      />
    </AppShell>
  );
}
