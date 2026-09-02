"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ExportMenu } from "@/components/ExportMenu";
import {
  Alert,
  Button,
  DataTable,
  Input,
  Modal,
  PageToolbar,
  StatusBadge,
  Textarea,
} from "@/components/ui/form";
import { getApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { InventoryRow } from "@shared/ipc";

export default function InventoryPage() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryRow | null>(null);
  const [newQty, setNewQty] = useState("0");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await getApi().listInventory();
    if (!res.ok) setError(res.error);
    else setRows(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (lowOnly && !r.isLowStock) return false;
      if (!q) return true;
      return (
        r.productName.toLowerCase().includes(q) ||
        r.productSku.toLowerCase().includes(q) ||
        r.variantSku.toLowerCase().includes(q) ||
        r.size.toLowerCase().includes(q) ||
        r.color.toLowerCase().includes(q)
      );
    });
  }, [rows, search, lowOnly]);

  const openAdjust = (row: InventoryRow) => {
    setEditing(row);
    setNewQty(String(row.stockQty));
    setNotes("");
    setError("");
    setOpen(true);
  };

  const onSave = async () => {
    if (!editing) return;
    setSaving(true);
    setError("");
    const res = await getApi().adjustStock({
      variantId: editing.variantId,
      newQty: Number(newQty),
      notes: notes || undefined,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(false);
    await load();
  };

  return (
    <AppShell
      title="Inventory"
      permission="inventory.view"
    >
      {error && !open ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <PageToolbar
        search={search}
        onSearch={setSearch}
        actions={
          <>
            <ExportMenu
              filename="inventory"
              title="Inventory"
              columns={[
                { key: "product", label: "Product" },
                { key: "size", label: "Pack" },
                { key: "color", label: "Grade" },
                { key: "stockQty", label: "Stock" },
                { key: "reorderLevel", label: "Reorder" },
                { key: "costPrice", label: "Cost" },
                { key: "salePrice", label: "Sale" },
                { key: "status", label: "Status" },
              ]}
              rows={filtered.map((r) => ({
                product: r.productName,
                size: r.size,
                color: r.color,
                stockQty: r.stockQty,
                reorderLevel: r.reorderLevel,
                costPrice: r.costPrice,
                salePrice: r.salePrice,
                status: r.isActive ? "Active" : "Inactive",
              }))}
            />
            <Button
              variant={lowOnly ? "primary" : "secondary"}
              size="sm"
              onClick={() => setLowOnly((v) => !v)}
            >
              {lowOnly ? "Showing low stock" : "Low stock only"}
            </Button>
          </>
        }
      />

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading...</p>
      ) : (
        <DataTable
          headers={[
            "Product",
            "Pack",
            "Grade",
            "Stock",
            "Reorder",
            "Cost",
            "Sale",
            "Status",
            "Actions",
          ]}
          empty={filtered.length === 0}
        >
          {filtered.map((row) => (
            <tr key={row.variantId} className="border-b border-[var(--border)] last:border-0">
              <td className="px-4 py-3 font-medium">{row.productName}</td>
              <td className="px-4 py-3">{row.size}</td>
              <td className="px-4 py-3 text-[var(--text-muted)]">{row.color}</td>
              <td
                className={cn(
                  "px-4 py-3 font-semibold",
                  row.isLowStock ? "text-[var(--danger)]" : ""
                )}
              >
                {row.stockQty.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-[var(--text-muted)]">{row.reorderLevel}</td>
              <td className="px-4 py-3">{row.costPrice.toLocaleString()}</td>
              <td className="px-4 py-3">{row.salePrice.toLocaleString()}</td>
              <td className="px-4 py-3">
                <StatusBadge active={row.isActive} />
              </td>
              <td className="px-4 py-3">
                <Button variant="ghost" size="sm" onClick={() => openAdjust(row)} title="Adjust">
                  <SlidersHorizontal size={14} />
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <Modal
        open={open}
        title={editing ? `Adjust — ${editing.productName}` : "Adjust stock"}
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
        {editing ? (
          <p className="text-sm text-[var(--text-muted)]">
            Pack {editing.size} / {editing.color} · current{" "}
            <span className="font-medium text-[var(--text)]">{editing.stockQty}</span>
          </p>
        ) : null}
        <Input
          label="New quantity"
          type="number"
          min={0}
          step="0.01"
          value={newQty}
          onChange={(e) => setNewQty(e.target.value)}
        />
        <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Modal>
    </AppShell>
  );
}
