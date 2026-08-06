"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import {
  Alert,
  Button,
  DataTable,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/components/ui/form";
import { getApi } from "@/lib/api";
import type { ClientCompany, CompaniesDemandSummary } from "@shared/ipc";

function today() {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm = {
  companyName: "",
  area: "",
  joinedAt: today(),
  notes: "",
  isActive: true,
};

export default function ClientCompaniesPage() {
  const [rows, setRows] = useState<ClientCompany[]>([]);
  const [demand, setDemand] = useState<CompaniesDemandSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const api = getApi();
    const [list, dem] = await Promise.all([api.listClientCompanies(), api.getCompaniesDemand()]);
    if (!list.ok) setError(list.error);
    else setRows(list.data);
    if (dem.ok) setDemand(dem.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
    setError("");
  };

  const openEdit = (row: ClientCompany) => {
    setEditingId(row.id);
    setForm({
      companyName: row.companyName,
      area: row.area,
      joinedAt: row.joinedAt.slice(0, 10),
      notes: row.notes ?? "",
      isActive: row.isActive,
    });
    setOpen(true);
    setError("");
  };

  const onSave = async () => {
    setSaving(true);
    setError("");
    setOkMsg("");
    const payload = {
      companyName: form.companyName,
      area: form.area,
      joinedAt: form.joinedAt,
      notes: form.notes || null,
      isActive: form.isActive,
    };
    const res = editingId
      ? await getApi().updateClientCompany(editingId, payload)
      : await getApi().createClientCompany(payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOkMsg(editingId ? "Company updated" : "Company added");
    setOpen(false);
    await load();
  };

  const onDelete = async (row: ClientCompany) => {
    if (!confirm(`Remove ${row.companyName} from the registry?`)) return;
    const res = await getApi().deleteClientCompany(row.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await load();
  };

  return (
    <AppShell
      title="Client Companies"
      subtitle="Companies using Agri Soft Pro — name, join date, demand by area (this PC)"
      permission="platform.view"
    >
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

      {demand ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Total companies</div>
            <div className="mt-1 text-2xl font-semibold">{demand.totalCompanies}</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Active</div>
            <div className="mt-1 text-2xl font-semibold">{demand.activeCompanies}</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Top area</div>
            <div className="mt-1 text-2xl font-semibold">
              {demand.areaDemand[0]
                ? `${demand.areaDemand[0].area} (${demand.areaDemand[0].companyCount})`
                : "—"}
            </div>
          </div>
        </div>
      ) : null}

      {demand && demand.areaDemand.length > 0 ? (
        <div className="mb-8 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <h2 className="mb-3 text-sm font-semibold">Demand by area</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={demand.areaDemand}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="area" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="companyCount" name="Companies" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Registry</h2>
        <div className="flex flex-wrap gap-2">
          <ExportMenu
            filename="client-companies"
            title="Client companies"
            columns={[
              { key: "companyName", label: "Company" },
              { key: "area", label: "Area" },
              { key: "joinedAt", label: "Joined" },
              { key: "isActive", label: "Active" },
              { key: "notes", label: "Notes" },
            ]}
            rows={rows.map((r) => ({
              companyName: r.companyName,
              area: r.area,
              joinedAt: r.joinedAt.slice(0, 10),
              isActive: r.isActive,
              notes: r.notes ?? "",
            }))}
          />
          <Button size="sm" onClick={openCreate}>
            <Plus size={14} /> Add company
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading...</p>
      ) : (
        <DataTable
          headers={["Company", "Area", "Joined", "Status", "Notes", "Actions"]}
          empty={rows.length === 0}
        >
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
              <td className="px-4 py-3 font-medium">{row.companyName}</td>
              <td className="px-4 py-3">{row.area}</td>
              <td className="px-4 py-3">{row.joinedAt.slice(0, 10)}</td>
              <td className="px-4 py-3">{row.isActive ? "Active" : "Inactive"}</td>
              <td className="px-4 py-3 text-[var(--text-muted)]">{row.notes || "—"}</td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(row)} title="Edit">
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void onDelete(row)} title="Delete">
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
        onClose={() => setOpen(false)}
        title={editingId ? "Edit company" : "Add company"}
      >
        <div className="space-y-3">
          <Input
            label="Company name"
            value={form.companyName}
            onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
            placeholder="e.g. Green Field Agri Store"
          />
          <Input
            label="Area / city"
            value={form.area}
            onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
            placeholder="e.g. Lahore"
          />
          <Input
            label="Joined / started using"
            type="date"
            value={form.joinedAt}
            onChange={(e) => setForm((f) => ({ ...f, joinedAt: e.target.value }))}
          />
          <Select
            label="Status"
            value={form.isActive ? "1" : "0"}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.value === "1" }))}
            options={[
              { value: "1", label: "Active" },
              { value: "0", label: "Inactive" },
            ]}
          />
          <Textarea
            label="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void onSave()} disabled={saving || !form.companyName || !form.area}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
