import React, { useMemo, useState } from "react";
import { formatMoney } from "../lib/currency";
import { archiveProductLocal, Snapshot, upsertProductLocal } from "../lib/data";
import { Inventory, Product, SyncConflict } from "../types";

type InventoryPageProps = {
  snapshot: Snapshot;
  onChange: () => void;
  syncConflicts: SyncConflict[];
};

export default function InventoryPage({ snapshot, onChange, syncConflicts }: InventoryPageProps) {
  const { products, inventory } = snapshot;
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [lowOnly, setLowOnly] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({
    name: "",
    barcode: "",
    price: "",
    category: "",
    quantity: "",
    reorderLevel: ""
  });

  const inventoryMap = useMemo(() => {
    const map = new Map<string, Inventory>();
    inventory.forEach(item => map.set(item.productId, item));
    return map;
  }, [inventory]);

  const categories = useMemo(
    () => ["all", ...new Set(products.map(product => product.category).filter(Boolean) as string[])],
    [products]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter(product => {
      if (!product.active) {
        return false;
      }

      const inv = inventoryMap.get(product.id);
      const matchesSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        (product.barcode || "").toLowerCase().includes(query) ||
        (product.category || "").toLowerCase().includes(query);
      const matchesCategory = category === "all" || product.category === category;
      const matchesLow = !lowOnly || (inv ? inv.quantity <= inv.reorderLevel : false);

      return matchesSearch && matchesCategory && matchesLow;
    });
  }, [products, inventoryMap, search, category, lowOnly]);

  const resetForm = () => {
    setEditing(null);
    setForm({
      name: "",
      barcode: "",
      price: "",
      category: "",
      quantity: "",
      reorderLevel: ""
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setStatus("Product name is required.");
      return;
    }

    const currentInventory = editing ? inventoryMap.get(editing.id) : undefined;

    await upsertProductLocal({
      id: editing?.id,
      name: form.name.trim(),
      barcode: form.barcode.trim() || null,
      price: Number(form.price || 0),
      category: form.category.trim() || null,
      quantity: Number(form.quantity || 0),
      reorderLevel: Number(form.reorderLevel || 5),
      createdAt: editing?.createdAt,
      baseInventoryUpdatedAt: currentInventory?.updatedAt
    });

    setStatus(editing ? "Product updated locally. Sync will push it to other devices." : "Product added locally.");
    resetForm();
    onChange();
  };

  const startEdit = (product: Product) => {
    const inv = inventoryMap.get(product.id);
    setEditing(product);
    setForm({
      name: product.name,
      barcode: product.barcode || "",
      price: String(product.price),
      category: product.category || "",
      quantity: String(inv?.quantity ?? 0),
      reorderLevel: String(inv?.reorderLevel ?? 5)
    });
  };

  const handleArchive = async (productId: string) => {
    if (!confirm("Archive this product?")) {
      return;
    }

    await archiveProductLocal(productId);
    setStatus("Product archived locally.");
    onChange();
  };

  return (
    <div className="stack">
      {syncConflicts.length > 0 && (
        <div className="notice warn">
          Some inventory edits were not auto-applied because stock changed on another device first. Review the affected
          products before counting stock again.
        </div>
      )}

      <div className="section">
        <div className="section-head">
          <h3>{editing ? "Edit Product" : "Add Product"}</h3>
          {status && <span className="pill">{status}</span>}
        </div>

        <form onSubmit={handleSubmit} className="stack">
          <div className="form-grid">
            <div>
              <label>Name</label>
              <input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
            </div>
            <div>
              <label>Barcode</label>
              <input value={form.barcode} onChange={event => setForm({ ...form, barcode: event.target.value })} />
            </div>
            <div>
              <label>Price</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={event => setForm({ ...form, price: event.target.value })}
              />
            </div>
            <div>
              <label>Category</label>
              <input value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} />
            </div>
            <div>
              <label>Quantity</label>
              <input
                type="number"
                min="0"
                step="1"
                value={form.quantity}
                onChange={event => setForm({ ...form, quantity: event.target.value })}
              />
            </div>
            <div>
              <label>Reorder Level</label>
              <input
                type="number"
                min="0"
                step="1"
                value={form.reorderLevel}
                onChange={event => setForm({ ...form, reorderLevel: event.target.value })}
              />
            </div>
          </div>
          <div className="action-row">
            <button className="primary" type="submit">{editing ? "Save Changes" : "Add Product"}</button>
            {editing && (
              <button className="secondary" type="button" onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="section">
        <div className="section-head">
          <h3>Stock List</h3>
          <span className="pill">{filtered.length} items</span>
        </div>

        <div className="form-grid">
          <div>
            <label>Search</label>
            <input value={search} onChange={event => setSearch(event.target.value)} />
          </div>
          <div>
            <label>Category</label>
            <select value={category} onChange={event => setCategory(event.target.value)}>
              {categories.map(item => (
                <option key={item} value={item}>
                  {item === "all" ? "All categories" : item}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Filter</label>
            <select value={lowOnly ? "low" : "all"} onChange={event => setLowOnly(event.target.value === "low")}>
              <option value="all">All stock</option>
              <option value="low">Low stock only</option>
            </select>
          </div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Barcode</th>
              <th>Price</th>
              <th>Qty</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(product => {
              const inv = inventoryMap.get(product.id);
              const low = inv ? inv.quantity <= inv.reorderLevel : false;

              return (
                <tr key={product.id}>
                  <td>
                    <strong>{product.name}</strong>
                    <div className="muted">{product.category || "Uncategorized"}</div>
                  </td>
                  <td>{product.barcode || "-"}</td>
                  <td>{formatMoney(product.price)}</td>
                  <td>{inv?.quantity ?? 0}</td>
                  <td>
                    <span className={`badge ${low ? "low" : "ok"}`}>{low ? "Low" : "OK"}</span>
                  </td>
                  <td className="action-row">
                    <button className="secondary" type="button" onClick={() => startEdit(product)}>
                      Edit
                    </button>
                    <button className="secondary" type="button" onClick={() => handleArchive(product.id)}>
                      Archive
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
