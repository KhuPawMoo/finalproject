import React, { useMemo, useState } from "react";
import { archiveProductLocal, Snapshot, upsertProductLocal } from "../lib/data";
import { Inventory, Product } from "../types";

const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export default function InventoryPage({ snapshot, onChange }: { snapshot: Snapshot; onChange: () => void }) {
  const { products, inventory } = snapshot;
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [lowOnly, setLowOnly] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

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

  const categories = useMemo(() => {
    return ["all", ...new Set(products.map(p => p.category).filter(Boolean) as string[])];
  }, [products]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter(product => {
      if (!product.active) return false;
      const inv = inventoryMap.get(product.id);
      const matchesSearch = !query ||
        product.name.toLowerCase().includes(query) ||
        (product.barcode || "").toLowerCase().includes(query);
      const matchesCategory = category === "all" || product.category === category;
      const matchesLow = !lowOnly || (inv && inv.quantity <= inv.reorderLevel);
      return matchesSearch && matchesCategory && matchesLow;
    });
  }, [products, inventoryMap, search, category, lowOnly]);

  const resetForm = () => {
    setEditing(null);
    setForm({ name: "", barcode: "", price: "", category: "", quantity: "", reorderLevel: "" });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return;

    await upsertProductLocal({
      id: editing?.id,
      name: form.name.trim(),
      barcode: form.barcode.trim() || null,
      price: Number(form.price || 0),
      category: form.category.trim() || null,
      quantity: Number(form.quantity || 0),
      reorderLevel: Number(form.reorderLevel || 5)
    });

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

  const handleDelete = async (productId: string) => {
    if (!confirm("Archive this product?")) return;
    await archiveProductLocal(productId);
    onChange();
  };

  return (
    <div>
      <div className="section">
        <h3>{editing ? "Edit Product" : "Add Product"}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div>
              <label>Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label>Barcode</label>
              <input value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} />
            </div>
            <div>
              <label>Price</label>
              <input type="number" min="0" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
            </div>
            <div>
              <label>Category</label>
              <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
            </div>
            <div>
              <label>Quantity</label>
              <input type="number" min="0" step="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
            </div>
            <div>
              <label>Reorder Level</label>
              <input type="number" min="0" step="1" value={form.reorderLevel} onChange={e => setForm({ ...form, reorderLevel: e.target.value })} />
            </div>
          </div>
          <div className="inline" style={{ marginTop: 12 }}>
            <button className="primary" type="submit">
              {editing ? "Save" : "Add"}
            </button>
            {editing && (
              <button className="secondary" type="button" onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="section">
        <h3>Inventory</h3>
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <div>
            <label>Search</label>
            <input value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div>
            <label>Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}>
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat === "all" ? "All" : cat}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Low Stock</label>
            <select value={lowOnly ? "low" : "all"} onChange={e => setLowOnly(e.target.value === "low")}>
              <option value="all">All</option>
              <option value="low">Low Only</option>
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
                  <td>{product.name}</td>
                  <td>{product.barcode || "-"}</td>
                  <td>{formatMoney(product.price)}</td>
                  <td>{inv?.quantity ?? 0}</td>
                  <td>
                    <span className={`badge ${low ? "low" : "ok"}`}>{low ? "Low" : "OK"}</span>
                  </td>
                  <td className="inline">
                    <button className="secondary" type="button" onClick={() => startEdit(product)}>
                      Edit
                    </button>
                    <button className="secondary" type="button" onClick={() => handleDelete(product.id)}>
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
