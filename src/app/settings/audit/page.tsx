"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Search } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import { Alert, Button, DataTable, Input, Select } from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { formatAuditAction, formatAuditModule, formatAuditWhen } from "@/lib/auditLabels";
import type { AuditLogRow } from "@shared/ipc";

const PAGE_SIZE = 50;

function monthStartIsoDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function todayIsoDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AuditLogPage() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [modules, setModules] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  const [fromDate, setFromDate] = useState(monthStartIsoDate());
  const [toDate, setToDate] = useState(todayIsoDate());
  const [module, setModule] = useState("");
  const [action, setAction] = useState("");
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await getApi().listAuditLogs({
      fromDate,
      toDate,
      module: module || undefined,
      action: action || undefined,
      search: search || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      setRows([]);
      setTotal(0);
      return;
    }
    setRows(res.data.rows);
    setTotal(res.data.total);
    setModules(res.data.modules);
    setActions(res.data.actions);
  }, [fromDate, toDate, module, action, search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const exportRows = useMemo(
    () =>
      rows.map((r) => ({
        when: formatAuditWhen(r.createdAt),
        user: r.username ?? "",
        module: formatAuditModule(r.module),
        moduleCode: r.module,
        action: formatAuditAction(r.action),
        actionCode: r.action,
        details: r.details ?? "",
        entityId: r.entityId ?? "",
      })),
    [rows]
  );

  const applySearch = () => {
    setPage(0);
    setSearch(searchDraft.trim());
  };

  const clearFilters = () => {
    setFromDate(monthStartIsoDate());
    setToDate(todayIsoDate());
    setModule("");
    setAction("");
    setSearch("");
    setSearchDraft("");
    setPage(0);
  };

  return (
    <AppShell
      title="Audit log"
      permission="settings.manage"
    >
      <div className="space-y-5">
        {error ? <Alert>{error}</Alert> : null}

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ClipboardList size={16} className="text-[var(--accent)]" />
              Activity filters
            </div>
            <ExportMenu
              filename="audit-log"
              title="Audit log"
              columns={[
                { key: "when", label: "When" },
                { key: "user", label: "User" },
                { key: "module", label: "Module" },
                { key: "action", label: "Action" },
                { key: "details", label: "Details" },
                { key: "entityId", label: "Entity ID" },
              ]}
              rows={exportRows}
              disabled={!exportRows.length}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              label="From"
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(0);
              }}
            />
            <Input
              label="To"
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(0);
              }}
            />
            <Select
              label="Module"
              value={module}
              onChange={(e) => {
                setModule(e.target.value);
                setPage(0);
              }}
              options={[
                { value: "", label: "All modules" },
                ...modules.map((m) => ({ value: m, label: formatAuditModule(m) })),
              ]}
            />
            <Select
              label="Action"
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(0);
              }}
              options={[
                { value: "", label: "All actions" },
                ...actions.map((a) => ({ value: a, label: formatAuditAction(a) })),
              ]}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                Search
              </label>
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                />
                <input
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applySearch();
                  }}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] py-2 pe-3 ps-9 text-sm outline-none ring-[var(--accent)] focus:ring-1"
                />
              </div>
            </div>
            <Button type="button" onClick={applySearch}>
              Search
            </Button>
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
            <Button type="button" variant="ghost" onClick={clearFilters}>
              Clear
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
          <span>
            {loading ? "Loading…" : `${total} event${total === 1 ? "" : "s"}`}
            {!loading && total > 0
              ? ` · showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)}`
              : null}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={page <= 0 || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <span>
              Page {Math.min(page + 1, pageCount)} / {pageCount}
            </span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={page + 1 >= pageCount || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>

        <DataTable
          headers={["When", "User", "Module", "Action", "Details"]}
          empty={!loading && !rows.length}
        >
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
              <td className="whitespace-nowrap px-4 py-2.5 text-[var(--text-muted)]">
                {formatAuditWhen(row.createdAt)}
              </td>
              <td className="px-4 py-2.5 font-medium">{row.username ?? "—"}</td>
              <td className="px-4 py-2.5">
                <span className="rounded border border-[var(--border)] bg-[var(--bg-soft)] px-1.5 py-0.5 text-[11px]">
                  {formatAuditModule(row.module)}
                </span>
              </td>
              <td className="px-4 py-2.5">{formatAuditAction(row.action)}</td>
              <td className="max-w-md px-4 py-2.5 text-[var(--text-muted)]">
                {row.details ?? "—"}
              </td>
            </tr>
          ))}
        </DataTable>
      </div>
    </AppShell>
  );
}
