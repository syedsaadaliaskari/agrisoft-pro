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
import type { Category } from "@shared/ipc";

const emptyForm = {
  name: "",
  parentId: "",
  description: "",
  isActive: true,
};

export default function CategoriesPage() {
  const [rows, setRows] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await getApi().listCategories();
    if (!res.ok) setError(res.error);
    else setRows(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byId = useMemo(() => Object.fromEntries(rows.map((r) => [r.id, r])), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q) ||
        (r.parentId && byId[r.parentId]?.name.toLowerCase().includes(q))
    );
  }, [rows, search, byId]);

  const parentOptions = useMemo(
    () => [
      { value: "", label: "None" },
      ...rows
        .filter((r) => !editing || r.id !== editing.id)
        .map((r) => ({ value: r.id, label: r.name })),
    ],
    [rows, editing]
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setOpen(true);
  };

  const openEdit = (row: Category) => {
    setEditing(row);
    setForm({
      name: row.name,
      parentId: row.parentId ?? "",
      description: row.description ?? "",
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
      parentId: form.parentId || null,
      description: form.description || null,
      isActive: form.isActive,
    };
    const api = getApi();
    const res = editing
      ? await api.updateCategory(editing.id, payload)
      : await api.createCategory(payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(false);
    await load();
  };

  const onDelete = async (row: Category) => {
    if (!confirm(`Delete category "${row.name}"?`)) return;
    const res = await getApi().deleteCategory(row.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await load();
  };

  return (
    <AppShell title="Categories" subtitle="Product category tree" permission="products.view">
      {error && !open ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <PageToolbar
        search={search}
        onSearch={setSearch}
        onAdd={openCreate}
        addLabel="Add category"
        actions={
          <ExportMenu
            filename="categories"
            title="Categories"
            columns={[
              { key: "name", label: "Name" },
              { key: "parent", label: "Parent" },
              { key: "description", label: "Description" },
              { key: "status", label: "Status" },
            ]}
            rows={filtered.map((r) => ({
              name: r.name,
              parent: r.parentId ? byId[r.parentId]?.name ?? "" : "",
              description: r.description ?? "",
              status: r.isActive ? "Active" : "Inactive",
            }))}
          />
        }
      />

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading...</p>
      ) : (
        <DataTable
          headers={["Name", "Parent", "Description", "Status", "Actions"]}
          empty={filtered.length === 0}
        >
          {filtered.map((row) => (
            <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
              <td className="px-4 py-3 font-medium">{row.name}</td>
              <td className="px-4 py-3 text-[var(--text-muted)]">
                {row.parentId ? byId[row.parentId]?.name ?? "—" : "—"}
              </td>
              <td className="px-4 py-3 text-[var(--text-muted)]">{row.description || "—"}</td>
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
        title={editing ? "Edit category" : "Add category"}
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
          label="Parent category"
          value={form.parentId}
          onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
          options={parentOptions}
        />
        <Textarea
          label="Description"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
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
