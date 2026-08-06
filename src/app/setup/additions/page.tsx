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
} from "@/components/ui/form";
import { getApi } from "@/lib/api";
import type { Addition, AmountType } from "@shared/ipc";

const emptyForm = { name: "", type: "fixed" as AmountType, value: "0", isActive: true };

export default function AdditionsPage() {
  const [rows, setRows] = useState<Addition[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Addition | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await getApi().listAdditions();
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

  const openEdit = (row: Addition) => {
    setEditing(row);
    setForm({
      name: row.name,
      type: row.type,
      value: String(row.value),
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
      type: form.type,
      value: Number(form.value),
      isActive: form.isActive,
    };
    const api = getApi();
    const res = editing
      ? await api.updateAddition(editing.id, payload)
      : await api.createAddition(payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(false);
    await load();
  };

  const onDelete = async (row: Addition) => {
    if (!confirm(`Delete addition "${row.name}"?`)) return;
    const res = await getApi().deleteAddition(row.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await load();
  };

  return (
    <AppShell title="Additions" subtitle="Extra charges (delivery, packing, etc.)" permission="settings.manage">
      {error && !open ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <PageToolbar
        search={search}
        onSearch={setSearch}
        onAdd={openCreate}
        addLabel="Add charge"
        actions={
          <ExportMenu
            filename="additions"
            title="Additions"
            columns={[
              { key: "name", label: "Name" },
              { key: "type", label: "Type" },
              { key: "value", label: "Value" },
              { key: "status", label: "Status" },
            ]}
            rows={filtered.map((r) => ({
              name: r.name,
              type: r.type,
              value: r.type === "percent" ? `${r.value}%` : r.value,
              status: r.isActive ? "Active" : "Inactive",
            }))}
          />
        }
      />

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading...</p>
      ) : (
        <DataTable headers={["Name", "Type", "Value", "Status", "Actions"]} empty={filtered.length === 0}>
          {filtered.map((row) => (
            <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
              <td className="px-4 py-3 font-medium">{row.name}</td>
              <td className="px-4 py-3 capitalize text-[var(--text-muted)]">{row.type}</td>
              <td className="px-4 py-3">
                {row.type === "percent" ? `${row.value}%` : row.value.toFixed(2)}
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
        title={editing ? "Edit addition" : "Add charge"}
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
        <Select
          label="Type"
          value={form.type}
          onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as AmountType }))}
          options={[
            { value: "fixed", label: "Fixed amount" },
            { value: "percent", label: "Percent" },
          ]}
        />
        <Input
          label={form.type === "percent" ? "Value (%)" : "Value (amount)"}
          type="number"
          min={0}
          step="0.01"
          value={form.value}
          onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
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
