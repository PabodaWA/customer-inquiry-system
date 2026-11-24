"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertCircle, Check, LoaderCircle, Pencil, Plus, ShieldCheck, UserRound, Users, X } from "lucide-react";
import { apiRequest, readableLabel } from "../../../../lib/admin";

type StaffMember = { id: number; full_name: string; email: string; role: "INTAKE" | "HANDLER"; specialization: string | null; is_active: boolean; created_at: string; assigned_inquiry_count: number };
type StaffCategory = { id: number; name: string; is_active: boolean };
type StaffForm = { full_name: string; email: string; password: string; role: "INTAKE" | "HANDLER"; specialization: string };
const emptyForm: StaffForm = { full_name: "", email: "", password: "", role: "INTAKE", specialization: "" };

export default function StaffManagementPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [categories, setCategories] = useState<StaffCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<StaffForm>(emptyForm);

  const loadStaff = useCallback(async () => {
    try {
      const [staffResult, categoryResult] = await Promise.all([
        apiRequest<StaffMember[]>("/api/admin/staff"),
        apiRequest<StaffCategory[]>("/api/admin/categories"),
      ]);
      setStaff(staffResult.data ?? []);
      setCategories(categoryResult.data ?? []);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load staff members."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void loadStaff(), 0); return () => window.clearTimeout(timer); }, [loadStaff]);

  function openCreate() { setEditing(null); setForm(emptyForm); setError(""); setNotice(""); setDialogOpen(true); }
  function openEdit(member: StaffMember) { setEditing(member); setForm({ full_name: member.full_name, email: member.email, password: "", role: member.role, specialization: member.specialization ?? "" }); setError(""); setNotice(""); setDialogOpen(true); }
  function closeDialog() { setDialogOpen(false); setEditing(null); setForm(emptyForm); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice("");
    if (form.role === "HANDLER" && !form.specialization) { setError("Choose a specialization for this handler."); return; }
    setSaving(true);
    try {
      if (editing) {
        await apiRequest<StaffMember>(`/api/admin/staff/${editing.id}`, { method: "PATCH", body: JSON.stringify({ full_name: form.full_name.trim(), email: form.email.trim(), specialization: form.role === "HANDLER" ? form.specialization : null }) });
        setNotice(`${form.full_name.trim()}’s staff profile was updated.`);
      } else {
        await apiRequest<StaffMember>("/api/admin/staff", { method: "POST", body: JSON.stringify({ full_name: form.full_name.trim(), email: form.email.trim(), password: form.password, role: form.role, specialization: form.role === "HANDLER" ? form.specialization : null }) });
        setNotice(`${form.full_name.trim()} was added to staff.`);
      }
      closeDialog(); await loadStaff();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Staff changes could not be saved."); }
    finally { setSaving(false); }
  }

  async function toggleActive(member: StaffMember) {
    const next = !member.is_active;
    if (!window.confirm(`${next ? "Activate" : "Deactivate"} ${member.full_name}?${next ? "" : " They will no longer be able to sign in or receive new assignments."}`)) return;
    setError(""); setNotice("");
    try {
      await apiRequest<StaffMember>(`/api/admin/staff/${member.id}/status`, { method: "PATCH", body: JSON.stringify({ is_active: next }) });
      setNotice(`${member.full_name} was ${next ? "activated" : "deactivated"}.`);
      await loadStaff();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Staff status could not be updated."); }
  }

  const activeCount = staff.filter((member) => member.is_active).length;
  const activeCategories = categories.filter((category) => category.is_active);
  return <div className="page-content management-page">
    <div className="management-heading"><div><p className="eyebrow"><span className="eyebrow-dot"/> TEAM ADMINISTRATION</p><h2>Staff management</h2><p>Add team members, update account details, and manage access.</p></div><button className="primary-button" onClick={openCreate}><Plus size={16}/> Add staff</button></div>
    <div className="summary-grid"><article className="summary-card"><span><Users size={18}/></span><div><small>Total staff</small><strong>{loading ? "—" : staff.length}</strong></div></article><article className="summary-card"><span><ShieldCheck size={18}/></span><div><small>Active staff</small><strong>{loading ? "—" : activeCount}</strong></div></article><article className="summary-card"><span><UserRound size={18}/></span><div><small>Assigned inquiries</small><strong>{loading ? "—" : staff.reduce((sum, member) => sum + member.assigned_inquiry_count, 0)}</strong></div></article></div>
    {notice && <div className="feedback success-feedback" role="status"><Check size={16}/>{notice}<button aria-label="Dismiss message" onClick={() => setNotice("")}><X size={15}/></button></div>}
    {error && !editing && <div className="feedback error-feedback" role="alert"><AlertCircle size={16}/>{error}<button aria-label="Dismiss error" onClick={() => setError("")}><X size={15}/></button></div>}
    <section className="management-card">
      <div className="management-toolbar"><div><strong>Team members</strong><p>Intake staff and handlers with their assigned workload.</p></div><span className="record-count">{loading ? "Loading…" : `${staff.length} accounts`}</span></div>
      {loading ? <div className="management-state"><LoaderCircle className="state-spinner" size={22}/>Loading staff…</div> : error && !staff.length ? <div className="management-state"><AlertCircle size={22}/><strong>Staff list unavailable</strong><button className="secondary-button" onClick={() => { setLoading(true); setError(""); void loadStaff(); }}>Try again</button></div> : !staff.length ? <div className="management-state"><UserRound size={23}/><strong>No staff members yet</strong><span>Add an intake staff member or handler to get started.</span><button className="primary-button" onClick={openCreate}><Plus size={15}/> Add staff</button></div> : <div className="table-scroll"><table><thead><tr><th>STAFF MEMBER</th><th>ROLE</th><th>SPECIALIZATION</th><th>ASSIGNED INQUIRIES</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{staff.map((member) => <tr key={member.id}><td><span className="customer-cell"><span className="customer-avatar">{member.full_name.slice(0,1).toUpperCase()}</span><span className="staff-name"><strong>{member.full_name}</strong><small>{member.email}</small></span></span></td><td>{readableLabel(member.role)}</td><td>{member.specialization ? readableLabel(member.specialization) : "—"}</td><td>{member.assigned_inquiry_count}</td><td><span className={`assignment-state ${member.is_active ? "is-assigned" : "is-unassigned"}`}>{member.is_active ? "Active" : "Inactive"}</span></td><td><div className="staff-actions"><button className="row-action" onClick={() => openEdit(member)} aria-label={`Edit ${member.full_name}`}><Pencil size={15}/></button><button className="secondary-button" onClick={() => void toggleActive(member)}>{member.is_active ? "Deactivate" : "Activate"}</button></div></td></tr>)}</tbody></table></div>}
    </section>
    {dialogOpen && <StaffDialog editing={editing} form={form} setForm={setForm} categories={activeCategories} saving={saving} error={error} close={closeDialog} save={save}/>}
  </div>;
}

function StaffDialog({ editing, form, setForm, categories, saving, error, close, save }: { editing: StaffMember | null; form: StaffForm; setForm: (form: StaffForm) => void; categories: StaffCategory[]; saving: boolean; error: string; close: () => void; save: (event: FormEvent<HTMLFormElement>) => void }) {
  const options = categories.map((category) => category.name);
  if (form.specialization && !options.includes(form.specialization)) options.push(form.specialization);
  return <div className="modal-backdrop" role="presentation" onClick={close}><section className="inquiry-modal staff-dialog" role="dialog" aria-modal="true" aria-labelledby="staff-dialog-title" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="panel-kicker">TEAM ACCOUNT</span><h2 id="staff-dialog-title">{editing ? "Edit staff member" : "Add staff member"}</h2></div><button className="icon-button" type="button" onClick={close} aria-label="Close staff form"><X size={19}/></button></div><form onSubmit={save}><label className="form-field"><span>Full name</span><input required maxLength={120} value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} autoComplete="name"/></label><label className="form-field"><span>Email address</span><input type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email"/></label>{!editing && <label className="form-field"><span>Temporary password</span><input type="password" required minLength={10} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password"/><small>At least 10 characters.</small></label>}<label className="form-field"><span>Role</span><select value={form.role} disabled={Boolean(editing)} onChange={(event) => setForm({ ...form, role: event.target.value as StaffForm["role"], specialization: "" })}><option value="INTAKE">Intake</option><option value="HANDLER">Handler</option></select></label>{form.role === "HANDLER" && <label className="form-field"><span>Specialization</span><select required value={form.specialization} onChange={(event) => setForm({ ...form, specialization: event.target.value })}><option value="">Select specialization</option>{options.map((value) => <option key={value} value={value}>{readableLabel(value)}{!categories.some((category) => category.name === value) ? " (inactive)" : ""}</option>)}</select>{!categories.length && <small>Add an active category before creating a handler.</small>}</label>}{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button type="submit" className="primary-button" disabled={saving || (form.role === "HANDLER" && !categories.length)}>{saving ? "Saving…" : editing ? "Save changes" : "Create staff account"}</button></div></form></section></div>;
}
