"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertCircle, Check, LoaderCircle, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { apiRequest, readableLabel } from "../../../../lib/admin";

type Category = { id: number; name: string; is_active: boolean; inquiry_count: number; created_at: string; updated_at: string };

export default function CategoryManagementPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Category | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");

  const loadCategories = useCallback(async () => {
    try { const result = await apiRequest<Category[]>("/api/admin/categories"); setCategories(result.data ?? []); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load categories."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void loadCategories(), 0); return () => window.clearTimeout(timer); }, [loadCategories]);

  function openCreate() { setEditing(null); setName(""); setError(""); setNotice(""); setDialogOpen(true); }
  function openEdit(category: Category) { setEditing(category); setName(category.name); setError(""); setNotice(""); setDialogOpen(true); }
  function closeDialog() { setDialogOpen(false); setEditing(null); setName(""); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice("");
    const normalized = name.trim().toUpperCase().replace(/\s+/g, "_");
    if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(normalized)) { setError("Use 2â€“40 letters, numbers, or underscores; start with a letter."); return; }
    setSaving(true);
    try {
      if (editing) {
        await apiRequest<Category>(`/api/admin/categories/${editing.id}`, { method: "PATCH", body: JSON.stringify({ name: normalized }) });
        setNotice(`Category ${readableLabel(normalized)} was updated.`);
      } else {
        await apiRequest<Category>("/api/admin/categories", { method: "POST", body: JSON.stringify({ name: normalized }) });
        setNotice(`Category ${readableLabel(normalized)} was added.`);
      }
      closeDialog(); await loadCategories();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Category could not be saved."); }
    finally { setSaving(false); }
  }

  async function toggleActive(category: Category) {
    const next = !category.is_active;
    if (!window.confirm(`${next ? "Reactivate" : "Deactivate"} ${readableLabel(category.name)}?${next ? "" : " Existing inquiries keep this category, but new inquiries canâ€™t use it."}`)) return;
    setError(""); setNotice("");
    try {
      await apiRequest<Category>(`/api/admin/categories/${category.id}`, { method: "PATCH", body: JSON.stringify({ is_active: next }) });
      setNotice(`${readableLabel(category.name)} was ${next ? "activated" : "deactivated"}.`);
      if (editing?.id === category.id) closeDialog();
      await loadCategories();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Category status could not be updated."); }
  }

  async function deleteCategory(category: Category) {
    if (!window.confirm(`Delete ${readableLabel(category.name)}? Categories used by inquiries or handlers cannot be deleted; deactivate those instead.`)) return;
    setError(""); setNotice("");
    try {
      const result = await apiRequest<Category>(`/api/admin/categories/${category.id}`, { method: "DELETE" });
      setNotice(result.message ?? `${readableLabel(category.name)} was deleted.`);
      if (editing?.id === category.id) closeDialog();
      await loadCategories();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Category could not be deleted."); }
  }

  return <div className="page-content management-page">
    <div className="management-heading"><div><p className="eyebrow"><span className="eyebrow-dot"/> INQUIRY CONFIGURATION</p><h2>Category management</h2><p>Manage the categories available when staff create inquiries.</p></div><button className="primary-button" onClick={openCreate}><Plus size={16}/> Add category</button></div>
    {notice && <div className="feedback success-feedback" role="status"><Check size={16}/>{notice}<button aria-label="Dismiss message" onClick={() => setNotice("")}><X size={15}/></button></div>}
    {error && !dialogOpen && <div className="feedback error-feedback" role="alert"><AlertCircle size={16}/>{error}<button aria-label="Dismiss error" onClick={() => setError("")}><X size={15}/></button></div>}
    <section className="management-card"><div className="management-toolbar"><div><strong>Inquiry categories</strong><p>Counts include inquiries in every status. Deactivation preserves existing records.</p></div><span className="record-count">{loading ? "Loadingâ€¦" : `${categories.filter((item) => item.is_active).length} active`}</span></div>
      {loading ? <div className="management-state"><LoaderCircle className="state-spinner" size={22}/>Loading categoriesâ€¦</div> : error && !categories.length ? <div className="management-state"><AlertCircle size={22}/><strong>Category list unavailable</strong><button className="secondary-button" onClick={() => { setLoading(true); setError(""); void loadCategories(); }}>Try again</button></div> : !categories.length ? <div className="management-state"><Tags size={23}/><strong>No categories yet</strong><span>Add a category to make it available for new inquiries.</span><button className="primary-button" onClick={openCreate}><Plus size={15}/> Add category</button></div> : <div className="table-scroll"><table><thead><tr><th>CATEGORY</th><th>INQUIRIES</th><th>STATUS</th><th>UPDATED</th><th>ACTIONS</th></tr></thead><tbody>{categories.map((category) => <tr key={category.id}><td><span className="category-name-cell"><span className="category-card-icon"><Tags size={16}/></span><strong>{readableLabel(category.name)}</strong></span></td><td>{category.inquiry_count}</td><td><span className={`assignment-state ${category.is_active ? "is-assigned" : "is-unassigned"}`}>{category.is_active ? "Active" : "Inactive"}</span></td><td className="date-cell">{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(category.updated_at ?? category.created_at))}</td><td><div className="staff-actions"><button className="row-action" onClick={() => openEdit(category)} aria-label={`Edit ${readableLabel(category.name)}`}><Pencil size={15}/></button></div></td></tr>)}</tbody></table></div>}
    </section>
    {dialogOpen && <div className="modal-backdrop" role="presentation" onClick={closeDialog}><section className="inquiry-modal staff-dialog" role="dialog" aria-modal="true" aria-labelledby="category-dialog-title" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="panel-kicker">INQUIRY CONFIGURATION</span><h2 id="category-dialog-title">{editing ? "Edit category" : "Add category"}</h2></div><button className="icon-button" type="button" onClick={closeDialog} aria-label="Close category form"><X size={19}/></button></div><form onSubmit={save}><label className="form-field"><span>Category name</span><input required minLength={2} maxLength={40} pattern="[A-Za-z][A-Za-z0-9_ ]{1,39}" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. PRODUCT_QUESTION"/></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="secondary-button" onClick={closeDialog}>Cancel</button>{editing && <><button type="button" className="secondary-button" onClick={() => void toggleActive(editing)}>{editing.is_active ? "Deactivate" : "Activate"}</button><button type="button" className="danger-outline-button" onClick={() => void deleteCategory(editing)}><Trash2 size={14}/>Delete</button></>}<button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving..." : editing ? "Save changes" : "Create category"}</button></div></form></section></div>}
  </div>;
}
