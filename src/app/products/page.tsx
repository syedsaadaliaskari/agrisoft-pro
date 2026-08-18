"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
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
import type { Category, Product, ProductVariant, Tax, Unit } from "@shared/ipc";

const emptyProduct = {
  sku: "",
  name: "",
  description: "",
  categoryId: "",
  unitId: "",
  brand: "",
  season: "",
  costPrice: "0",
  salePrice: "0",
  wholesalePrice: "",
  taxId: "",
  reorderLevel: "0",
  isActive: true,
};

const emptyPack = {
  size: "",
  color: "",
  sku: "",
  stockQty: "0",
  costPrice: "",
  salePrice: "",
  isActive: true,
};

export default function ProductsPage() {
  const [rows, setRows] = useState<Product[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyProduct);
  const [saving, setSaving] = useState(false);

  const [packsOpen, setPacksOpen] = useState(false);
  const [packProduct, setPackProduct] = useState<Product | null>(null);
  const [packs, setPacks] = useState<ProductVariant[]>([]);
  const [packForm, setPackForm] = useState(emptyPack);
  const [editingPack, setEditingPack] = useState<ProductVariant | null>(null);
  const [packSaving, setPackSaving] = useState(false);
  const [packError, setPackError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const api = getApi();
    const [productsRes, unitsRes, catsRes, taxesRes] = await Promise.all([
      api.listProducts(),
      api.listUnits(),
      api.listCategories(),
      api.listTaxes(),
    ]);
    if (!productsRes.ok) setError(productsRes.error);
    else setRows(productsRes.data);
    if (unitsRes.ok) setUnits(unitsRes.data);
    if (catsRes.ok) setCategories(catsRes.data);
    if (taxesRes.ok) setTaxes(taxesRes.data);
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
        r.sku.toLowerCase().includes(q) ||
        (r.brand ?? "").toLowerCase().includes(q) ||
        (r.categoryName ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyProduct);
    setError("");
    setOpen(true);
  };

  const openEdit = (row: Product) => {
    setEditing(row);
    setForm({
      sku: row.sku,
      name: row.name,
      description: row.description ?? "",
      categoryId: row.categoryId ?? "",
      unitId: row.unitId ?? "",
      brand: row.brand ?? "",
      season: row.season ?? "",
      costPrice: String(row.costPrice),
      salePrice: String(row.salePrice),
      wholesalePrice: row.wholesalePrice == null ? "" : String(row.wholesalePrice),
      taxId: row.taxId ?? "",
      reorderLevel: String(row.reorderLevel),
      isActive: row.isActive,
    });
    setError("");
    setOpen(true);
  };

  const onSave = async () => {
    setSaving(true);
    setError("");
    const payload = {
      sku: form.sku || undefined,
      barcode: null,
      name: form.name,
      description: form.description || null,
      categoryId: form.categoryId || null,
      unitId: form.unitId || null,
      brand: form.brand || null,
      season: form.season || null,
      costPrice: Number(form.costPrice),
      salePrice: Number(form.salePrice),
      wholesalePrice: form.wholesalePrice === "" ? null : Number(form.wholesalePrice),
      taxId: form.taxId || null,
      reorderLevel: Number(form.reorderLevel),
      isActive: form.isActive,
    };
    const api = getApi();
    const res = editing
      ? await api.updateProduct(editing.id, payload)
      : await api.createProduct(payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(false);
    await load();
  };

  const onDelete = async (row: Product) => {
    if (!confirm(`Delete product "${row.name}"?`)) return;
    const res = await getApi().deleteProduct(row.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await load();
  };

  const openPacks = async (row: Product) => {
    setPackProduct(row);
    setPackError("");
    setEditingPack(null);
    setPackForm(emptyPack);
    setPacksOpen(true);
    const res = await getApi().listVariants(row.id);
    if (!res.ok) setPackError(res.error);
    else setPacks(res.data);
  };

  const savePack = async () => {
    if (!packProduct) return;
    setPackSaving(true);
    setPackError("");
    const payload = {
      size: packForm.size,
      color: packForm.color,
      sku: packForm.sku || undefined,
      stockQty: Number(packForm.stockQty),
      costPrice: packForm.costPrice === "" ? null : Number(packForm.costPrice),
      salePrice: packForm.salePrice === "" ? null : Number(packForm.salePrice),
      isActive: packForm.isActive,
    };
    const api = getApi();
    const res = editingPack
      ? await api.updateVariant(editingPack.id, payload)
      : await api.createVariant(packProduct.id, payload);
    setPackSaving(false);
    if (!res.ok) {
      setPackError(res.error);
      return;
    }
    setEditingPack(null);
    setPackForm(emptyPack);
    const list = await api.listVariants(packProduct.id);
    if (list.ok) setPacks(list.data);
    await load();
  };

  const editPack = (pack: ProductVariant) => {
    setEditingPack(pack);
    setPackForm({
      size: pack.size,
      color: pack.color,
      sku: pack.sku,
      stockQty: String(pack.stockQty),
      costPrice: pack.costPrice == null ? "" : String(pack.costPrice),
      salePrice: pack.salePrice == null ? "" : String(pack.salePrice),
      isActive: pack.isActive,
    });
    setPackError("");
  };

  const deletePack = async (pack: ProductVariant) => {
    if (!packProduct) return;
    if (!confirm(`Delete pack ${pack.size} / ${pack.color}?`)) return;
    const res = await getApi().deleteVariant(pack.id);
    if (!res.ok) {
      setPackError(res.error);
      return;
    }
    const list = await getApi().listVariants(packProduct.id);
    if (list.ok) setPacks(list.data);
    await load();
  };

  return (
    <AppShell title="Products" subtitle="Catalog, packs, and pricing" permission="products.view">
      {error && !open ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <PageToolbar
        search={search}
        onSearch={setSearch}
        onAdd={openCreate}
        addLabel="Add product"
        actions={
          <ExportMenu
            filename="products"
            title="Products"
            columns={[
              { key: "sku", label: "SKU" },
              { key: "name", label: "Name" },
              { key: "category", label: "Category" },
              { key: "unit", label: "Unit" },
              { key: "costPrice", label: "Cost" },
              { key: "salePrice", label: "Sale" },
              { key: "stock", label: "Stock" },
              { key: "packs", label: "Packs" },
              { key: "status", label: "Status" },
            ]}
            rows={filtered.map((r) => ({
              sku: r.sku,
              name: r.name,
              category: r.categoryName ?? "",
              unit: r.unitName ?? "",
              costPrice: r.costPrice,
              salePrice: r.salePrice,
              stock: r.totalStock ?? 0,
              packs: r.variantCount ?? 0,
              status: r.isActive ? "Active" : "Inactive",
            }))}
          />
        }
      />

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading...</p>
      ) : (
        <DataTable
          headers={[
            "SKU",
            "Name",
            "Category",
            "Unit",
            "Cost",
            "Sale",
            "Stock",
            "Packs",
            "Status",
            "Actions",
          ]}
          empty={filtered.length === 0}
        >
          {filtered.map((row) => (
            <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
              <td className="px-4 py-3 font-mono text-xs">{row.sku}</td>
              <td className="px-4 py-3 font-medium">{row.name}</td>
              <td className="px-4 py-3 text-[var(--text-muted)]">{row.categoryName || "—"}</td>
              <td className="px-4 py-3 text-[var(--text-muted)]">{row.unitName || "—"}</td>
              <td className="px-4 py-3">{row.costPrice.toLocaleString()}</td>
              <td className="px-4 py-3">{row.salePrice.toLocaleString()}</td>
              <td className="px-4 py-3">{(row.totalStock ?? 0).toLocaleString()}</td>
              <td className="px-4 py-3">{row.variantCount ?? 0}</td>
              <td className="px-4 py-3">
                <StatusBadge active={row.isActive} />
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => void openPacks(row)} title="Packs">
                    <Layers size={14} />
                  </Button>
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
        title={editing ? "Edit product" : "Add product"}
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
            label="SKU (auto if blank)"
            value={form.sku}
            onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
          />
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="Brand"
            value={form.brand}
            onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
          />
          <Select
            label="Category"
            value={form.categoryId}
            onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
            options={[
              { value: "", label: "None" },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <Select
            label="Unit"
            value={form.unitId}
            onChange={(e) => setForm((f) => ({ ...f, unitId: e.target.value }))}
            options={[
              { value: "", label: "None" },
              ...units.map((u) => ({ value: u.id, label: `${u.name} (${u.shortName})` })),
            ]}
          />
          <Select
            label="Tax"
            value={form.taxId}
            onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))}
            options={[
              { value: "", label: "None" },
              ...taxes.map((t) => ({ value: t.id, label: `${t.name} (${t.rate}%)` })),
            ]}
          />
          <Input
            label="Season / crop cycle"
            value={form.season}
            onChange={(e) => setForm((f) => ({ ...f, season: e.target.value }))}
          />
          <Input
            label="Cost price"
            type="number"
            min={0}
            step="0.01"
            value={form.costPrice}
            onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
          />
          <Input
            label="Sale price"
            type="number"
            min={0}
            step="0.01"
            value={form.salePrice}
            onChange={(e) => setForm((f) => ({ ...f, salePrice: e.target.value }))}
          />
          <Input
            label="Wholesale price"
            type="number"
            min={0}
            step="0.01"
            value={form.wholesalePrice}
            onChange={(e) => setForm((f) => ({ ...f, wholesalePrice: e.target.value }))}
          />
          <Input
            label="Reorder level"
            type="number"
            min={0}
            step="0.01"
            value={form.reorderLevel}
            onChange={(e) => setForm((f) => ({ ...f, reorderLevel: e.target.value }))}
          />
        </div>
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
        {!editing ? (
          <p className="text-xs text-[var(--text-muted)]">
            A default pack is created automatically. Manage extra packs from the Layers button.
          </p>
        ) : null}
      </Modal>

      <Modal
        open={packsOpen}
        title={packProduct ? `Packs — ${packProduct.name}` : "Packs"}
        onClose={() => setPacksOpen(false)}
        wide
        footer={
          <Button variant="secondary" onClick={() => setPacksOpen(false)}>
            Close
          </Button>
        }
      >
        {packError ? <Alert>{packError}</Alert> : null}

        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-soft)] p-3">
          <p className="mb-3 text-xs font-medium text-[var(--text-muted)]">
            {editingPack ? "Edit pack" : "Add pack (size / grade)"}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label="Pack size"
              value={packForm.size}
              onChange={(e) => setPackForm((f) => ({ ...f, size: e.target.value }))}
            />
            <Input
              label="Grade / type"
              value={packForm.color}
              onChange={(e) => setPackForm((f) => ({ ...f, color: e.target.value }))}
            />
            <Input
              label="SKU (auto if blank)"
              value={packForm.sku}
              onChange={(e) => setPackForm((f) => ({ ...f, sku: e.target.value }))}
            />
            {!editingPack ? (
              <Input
                label="Initial stock"
                type="number"
                min={0}
                step="0.01"
                value={packForm.stockQty}
                onChange={(e) => setPackForm((f) => ({ ...f, stockQty: e.target.value }))}
              />
            ) : null}
            <Input
              label="Cost override"
              type="number"
              min={0}
              step="0.01"
              value={packForm.costPrice}
              onChange={(e) => setPackForm((f) => ({ ...f, costPrice: e.target.value }))}
            />
            <Input
              label="Sale override"
              type="number"
              min={0}
              step="0.01"
              value={packForm.salePrice}
              onChange={(e) => setPackForm((f) => ({ ...f, salePrice: e.target.value }))}
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <Checkbox
              label="Active"
              checked={packForm.isActive}
              onChange={(checked) => setPackForm((f) => ({ ...f, isActive: checked }))}
            />
            <div className="flex gap-2">
              {editingPack ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditingPack(null);
                    setPackForm(emptyPack);
                  }}
                >
                  Cancel
                </Button>
              ) : null}
              <Button size="sm" onClick={() => void savePack()} disabled={packSaving}>
                <Plus size={14} />
                {packSaving ? "Saving..." : editingPack ? "Update pack" : "Add pack"}
              </Button>
            </div>
          </div>
        </div>

        <DataTable
          headers={["Pack", "Grade", "SKU", "Stock", "Status", ""]}
          empty={packs.length === 0}
        >
          {packs.map((pack) => (
            <tr key={pack.id} className="border-b border-[var(--border)] last:border-0">
              <td className="px-4 py-3 font-medium">{pack.size}</td>
              <td className="px-4 py-3">{pack.color}</td>
              <td className="px-4 py-3 font-mono text-xs">{pack.sku}</td>
              <td className="px-4 py-3">{pack.stockQty.toLocaleString()}</td>
              <td className="px-4 py-3">
                <StatusBadge active={pack.isActive} />
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => editPack(pack)}>
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void deletePack(pack)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      </Modal>
    </AppShell>
  );
}
