"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import {
  Alert,
  Button,
  Checkbox,
  DataTable,
  Input,
  Modal,
  PageToolbar,
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
  const [open, setOpen] = useState(false);
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

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setOpen(true);
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
    setOpen(true);
  };

  const onSave = async () => {
    setSaving(true);
    setError("");
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
    setOpen(false);
    await load();
  };

  const onDelete = async (row: Vendor) => {
    if (!confirm(`Delete vendor "${row.name}"?`)) return;
    const res = await getApi().deleteVendor(row.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await load();
  };

  return (
    <AppShell title="Vendors" subtitle="Suppliers and payables parties" permission="vendors.view">
      {error && !open ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <PageToolbar
        search={search}
        onSearch={setSearch}
        onAdd={openCreate}
        addLabel="Add vendor"
        actions={
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
        }
      />

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading...</p>
      ) : (
        <DataTable
          headers={["Code", "Name", "Phone", "City", "Opening", "Status", "Actions"]}
          empty={filtered.length === 0}
        >
          {filtered.map((row) => (
            <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
              <td className="px-4 py-3 font-mono text-xs">{row.code}</td>
              <td className="px-4 py-3 font-medium">{row.name}</td>
              <td className="px-4 py-3 text-[var(--text-muted)]">{row.phone || "—"}</td>
              <td className="px-4 py-3 text-[var(--text-muted)]">{row.city || "—"}</td>
              <td className="px-4 py-3">
                {row.openingBalance.toLocaleString()} {row.balanceType === "debit" ? "Dr" : "Cr"}
              </td>
              <td className="px-4 py-3">
                <StatusBadge active={row.isActive} />
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void onDelete(row)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <Modal
        open={open}
        title={editing ? "Edit vendor" : "Add vendor"}
        onClose={() => setOpen(false)}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void onSave()} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </>
        }
      >
        {error ? <Alert>{error}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Code (auto if blank)"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          />
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="Phone"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
          <Input
            label="Email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <Input
            label="City"
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
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
        </div>
        <Textarea
          label="Address"
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
        />
        <Checkbox
          label="Active"
          checked={form.isActive}
          onChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
        />
      </Modal>
    </AppShell>
  );
}
