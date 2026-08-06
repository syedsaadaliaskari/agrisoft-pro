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
  StatusBadge,
} from "@/components/ui/form";
import { getApi } from "@/lib/api";
import type { Tax } from "@shared/ipc";

const emptyForm = { name: "", rate: "0", isInclusive: false, isActive: true };

export default function TaxesPage() {
  const [rows, setRows] = useState<Tax[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tax | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await getApi().listTaxes();
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
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setOpen(true);
  };

  const openEdit = (row: Tax) => {
    setEditing(row);
    setForm({
      name: row.name,
      rate: String(row.rate),
      isInclusive: row.isInclusive,
      isActive: row.isActive,
    });
    setError("");
    setOpen(true);
  };

  const onSave = async () => {
    setSaving(true);
    setError("");
    const payload = {
      name: form.name,
      rate: Number(form.rate),
      isInclusive: form.isInclusive,
      isActive: form.isActive,
    };
    const api = getApi();
    const res = editing ? await api.updateTax(editing.id, payload) : await api.createTax(payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(false);
    await load();
  };

  const onDelete = async (row: Tax) => {
    if (!confirm(`Delete tax "${row.name}"?`)) return;
    const res = await getApi().deleteTax(row.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await load();
  };

  return (
    <AppShell title="Taxes" subtitle="Tax definitions for invoices" permission="settings.manage">
      {error && !open ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <PageToolbar
        search={search}
        onSearch={setSearch}
        onAdd={openCreate}
        addLabel="Add tax"
        actions={
          <ExportMenu
            filename="taxes"
            title="Taxes"
            columns={[
              { key: "name", label: "Name" },
              { key: "rate", label: "Rate" },
              { key: "mode", label: "Mode" },
              { key: "status", label: "Status" },
            ]}
            rows={filtered.map((r) => ({
              name: r.name,
              rate: `${r.rate}%`,
              mode: r.isInclusive ? "Inclusive" : "Exclusive",
              status: r.isActive ? "Active" : "Inactive",
            }))}
          />
        }
      />

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading...</p>
      ) : (
        <DataTable
          headers={["Name", "Rate", "Mode", "Status", "Actions"]}
          empty={filtered.length === 0}
        >
          {filtered.map((row) => (
            <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
              <td className="px-4 py-3 font-medium">{row.name}</td>
              <td className="px-4 py-3">{row.rate}%</td>
              <td className="px-4 py-3 text-[var(--text-muted)]">
                {row.isInclusive ? "Inclusive" : "Exclusive"}
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
        title={editing ? "Edit tax" : "Add tax"}
        onClose={() => setOpen(false)}
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
        <Input
          label="Name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <Input
          label="Rate (%)"
          type="number"
          min={0}
          step="0.01"
          value={form.rate}
          onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
        />
        <Checkbox
          label="Tax inclusive pricing"
          checked={form.isInclusive}
          onChange={(checked) => setForm((f) => ({ ...f, isInclusive: checked }))}
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
