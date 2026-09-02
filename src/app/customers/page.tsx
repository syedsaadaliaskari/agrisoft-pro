"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Trash2, UserRound, Users } from "lucide-react";
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
import type { Customer } from "@shared/ipc";

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  openingBalance: "0",
  balanceType: "debit",
  creditLimit: "0",
  isActive: true,
};

export default function CustomersPage() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await getApi().listCustomers();
    if (!res.ok) setError(res.error);
    else setRows(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const active = rows.filter((r) => r.isActive);
    const creditLimit = active.reduce((s, r) => s + (r.creditLimit || 0), 0);
    return {
      total: rows.length,
      active: active.length,
      creditLimit,
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

  const openEdit = (row: Customer) => {
    setEditing(row);
    setForm({
      name: row.name,
      phone: row.phone ?? "",
      email: row.email ?? "",
      address: row.address ?? "",
      city: row.city ?? "",
      openingBalance: String(row.openingBalance),
      balanceType: row.balanceType,
      creditLimit: String(row.creditLimit),
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
      name: form.name,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      city: form.city || null,
      openingBalance: Number(form.openingBalance),
      balanceType: form.balanceType as "debit" | "credit",
      creditLimit: Number(form.creditLimit),
      isActive: form.isActive,
    };
    const api = getApi();
    const res = editing
      ? await api.updateCustomer(editing.id, payload)
      : await api.createCustomer(payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOkMsg(editing ? "Updated" : "Saved");
    resetForm();
    await load();
  };

  const onDelete = async (row: Customer) => {
    if (!confirm(`Delete customer "${row.name}"?`)) return;
    const res = await getApi().deleteCustomer(row.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (editing?.id === row.id) resetForm();
    await load();
  };

  return (
    <AppShell title="Customers" subtitle="Buyers and credit parties" permission="customers.view">
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
        formTitle={editing ? "Edit customer" : "New customer"}
        stats={
          <OpsStatStrip
            items={[
              {
                label: "Customers",
                value: String(stats.total),
                hint: `${stats.active} active`,
                tone: "accent",
                icon: Users,
              },
              {
                label: "Credit limits",
                value: money(stats.creditLimit),
                hint: "Across active parties",
                icon: UserRound,
              },
            ]}
          />
        }
        form={
          <>
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
              label="Type"
              value={form.balanceType}
              onChange={(e) => setForm((f) => ({ ...f, balanceType: e.target.value }))}
              options={[
                { value: "debit", label: "Receivable" },
                { value: "credit", label: "Payable" },
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Opening balance"
                type="number"
                min={0}
                step="0.01"
                value={form.openingBalance}
                onChange={(e) => setForm((f) => ({ ...f, openingBalance: e.target.value }))}
              />
              <Input
                label="Credit limit"
                type="number"
                min={0}
                step="0.01"
                value={form.creditLimit}
                onChange={(e) => setForm((f) => ({ ...f, creditLimit: e.target.value }))}
              />
            </div>
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
                {saving ? "Saving..." : editing ? "Update customer" : "Save customer"}
              </Button>
            </div>
          </>
        }
        listTitle="Customer register"
        list={
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-1"
              />
              <ExportMenu
                filename="customers"
                title="Customers"
                columns={[
                  { key: "code", label: "Code" },
                  { key: "name", label: "Name" },
                  { key: "phone", label: "Phone" },
                  { key: "city", label: "City" },
                  { key: "opening", label: "Opening" },
                  { key: "creditLimit", label: "Credit limit" },
                  { key: "status", label: "Status" },
                ]}
                rows={filtered.map((r) => ({
                  code: r.code,
                  name: r.name,
                  phone: r.phone ?? "",
                  city: r.city ?? "",
                  opening: `${r.openingBalance} ${r.balanceType === "debit" ? "Receivable" : "Payable"}`,
                  creditLimit: r.creditLimit,
                  status: r.isActive ? "Active" : "Inactive",
                }))}
              />
            </div>
            {loading ? (
              <OpsListSkeleton rows={6} />
            ) : filtered.length === 0 ? (
              <OpsEmptyState title={search ? "No matching customers" : "No customers yet"} />
            ) : (
              <DataTable
                headers={["Party", "Contact", "Opening", "Limit", "Status", ""]}
                empty={false}
              >
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
                        {row.balanceType === "debit" ? "Receivable" : "Payable"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 tabular-nums text-sm">{money(row.creditLimit)}</td>
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
