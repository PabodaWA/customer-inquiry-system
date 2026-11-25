"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, FilterX, KeyRound, LoaderCircle, MoreHorizontal, Pencil, Plus, Search, ShieldCheck, Trash2, UserRound, Users, X } from "lucide-react";
import { apiRequest, readableLabel, type ApiResult } from "../../../../lib/admin";

type StaffMember = { id: number; full_name: string; email: string; role: "INTAKE" | "HANDLER"; specialization: string | null; is_active: boolean; created_at: string; assigned_inquiry_count: number };
type StaffCategory = { id: number; name: string; is_active: boolean };
type StaffForm = { full_name: string; email: string; role: "INTAKE" | "HANDLER"; specialization: string };
const emptyForm: StaffForm = { full_name: "", email: "", role: "INTAKE", specialization: "" };

export default function StaffManagementPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [specializationFilter, setSpecializationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categories, setCategories] = useState<StaffCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [actionsTarget, setActionsTarget] = useState<StaffMember | null>(null);
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

  function openCreate() { setEditing(null); setForm(emptyForm); setError(""); setNotice(""); setGeneratedPassword(""); setDialogOpen(true); }
  function openEdit(member: StaffMember) { setEditing(member); setForm({ full_name: member.full_name, email: member.email, role: member.role, specialization: member.specialization ?? "" }); setError(""); setNotice(""); setGeneratedPassword(""); setDialogOpen(true); }
  function closeDialog() { setDialogOpen(false); setEditing(null); setForm(emptyForm); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice("");
    if (form.role === "HANDLER" && !form.specialization) { setError("Choose a specialization for this handler."); return; }
    setSaving(true);
    try {
      if (editing) {
        await apiRequest<StaffMember>(`/api/admin/staff/${editing.id}`, { method: "PATCH", body: JSON.stringify({ full_name: form.full_name.trim(), email: form.email.trim(), specialization: form.role === "HANDLER" ? form.specialization : null }) });
        setNotice(`${form.full_name.trim()}â€™s staff profile was updated.`);
      } else {
        const result = await apiRequest<StaffMember>("/api/admin/staff", { method: "POST", body: JSON.stringify({ full_name: form.full_name.trim(), email: form.email.trim(), role: form.role, specialization: form.role === "HANDLER" ? form.specialization : null }) }) as ApiResult<StaffMember> & { temporary_password?: string };
        setNotice(`${form.full_name.trim()} was added to staff.`);
        setGeneratedPassword(result.temporary_password ?? "");
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

  async function resetPassword(member: StaffMember) {
    if (!window.confirm(`Generate a new temporary password for ${member.full_name}? Their current sessions will be signed out.`)) return;
    setActionsTarget(null);
    setError(""); setNotice(""); setGeneratedPassword(""); setResettingId(member.id);
    try {
      const result = await apiRequest<StaffMember>(`/api/admin/staff/${member.id}/reset-password`, { method: "POST" }) as ApiResult<StaffMember> & { temporary_password?: string };
      setNotice(`A new temporary password was generated for ${member.full_name}.`);
      setGeneratedPassword(result.temporary_password ?? "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reset this staff password."); }
    finally { setResettingId(null); }
  }

  async function deleteStaffMember(member: StaffMember) {
    if (!window.confirm(`Delete ${member.full_name}'s staff account? This cannot be undone. Accounts linked to inquiry history must be deactivated instead.`)) return;
    setActionsTarget(null);
    setError(""); setNotice(""); setGeneratedPassword("");
    try {
      const result = await apiRequest<StaffMember>(`/api/admin/staff/${member.id}`, { method: "DELETE" });
      setNotice(result.message ?? `${member.full_name} was deleted.`);
      setActionsTarget(null);
      await loadStaff();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete this staff account."); }
  }

  const activeCount = staff.filter((member) => member.is_active).length;
  const activeCategories = categories.filter((category) => category.is_active);
  const filteredStaff = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return staff.filter((member) => {
      const matchesSearch = !query || [member.full_name, member.email, readableLabel(member.role), member.specialization ? readableLabel(member.specialization) : ""]
        .some((value) => value.toLocaleLowerCase().includes(query));
      return matchesSearch && (!roleFilter || member.role === roleFilter) && (!specializationFilter || member.specialization === specializationFilter) && (!statusFilter || (statusFilter === "ACTIVE" ? member.is_active : !member.is_active));
    });
  }, [staff, searchQuery, roleFilter, specializationFilter, statusFilter]);
  return <div className="page-content management-page">
    <div className="management-heading"><div><p className="eyebrow"><span className="eyebrow-dot"/> TEAM ADMINISTRATION</p><h2>Staff management</h2><p>Add team members, update account details, and manage access.</p></div><button className="primary-button" onClick={openCreate}><Plus size={16}/> Add staff</button></div>
    <div className="summary-grid"><article className="summary-card"><span><Users size={18}/></span><div><small>Total staff</small><strong>{loading ? "â€”" : staff.length}</strong></div></article><article className="summary-card"><span><ShieldCheck size={18}/></span><div><small>Active staff</small><strong>{loading ? "â€”" : activeCount}</strong></div></article><article className="summary-card"><span><UserRound size={18}/></span><div><small>Assigned inquiries</small><strong>{loading ? "â€”" : staff.reduce((sum, member) => sum + member.assigned_inquiry_count, 0)}</strong></div></article></div>
    {notice && <div className="feedback success-feedback staff-created-feedback" role="status"><Check size={16}/><span>{notice}{generatedPassword && <small>Temporary password (shown once): <code>{generatedPassword}</code></small>}</span>{generatedPassword && <button className="copy-temp-password" onClick={() => void navigator.clipboard.writeText(generatedPassword)}>Copy password</button>}<button aria-label="Dismiss message" onClick={() => { setNotice(""); setGeneratedPassword(""); }}><X size={15}/></button></div>}
    {error && !editing && <div className="feedback error-feedback" role="alert"><AlertCircle size={16}/>{error}<button aria-label="Dismiss error" onClick={() => setError("")}><X size={15}/></button></div>}
    <section className="management-card">
      <div className="management-toolbar management-toolbar-stack"><div className="management-toolbar-heading"><div><strong>Team members</strong><p>Intake staff and handlers with their assigned workload.</p></div><span className="record-count">{loading ? "Loadingâ€¦" : `${filteredStaff.length} ${filteredStaff.length === 1 ? "account" : "accounts"}`}</span></div><div className="filter-controls"><label className="inquiry-search"><span>Search staff</span><span className="inquiry-search-input"><Search size={15}/><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Name, email, specialization…" aria-label="Search staff"/></span></label><label><span>Role</span><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="">All roles</option><option value="INTAKE">Intake</option><option value="HANDLER">Handler</option></select></label><label><span>Specialization</span><select value={specializationFilter} onChange={(event) => setSpecializationFilter(event.target.value)}><option value="">All specializations</option>{Array.from(new Set(staff.map((member) => member.specialization).filter((value): value is string => Boolean(value)))).sort().map((value) => <option key={value} value={value}>{readableLabel(value)}</option>)}</select></label><label><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label><button className="secondary-button" onClick={() => { setSearchQuery(""); setRoleFilter(""); setSpecializationFilter(""); setStatusFilter(""); }}><FilterX size={15}/> Clear</button></div></div>
      {loading ? <div className="management-state"><LoaderCircle className="state-spinner" size={22}/>Loading staffâ€¦</div> : error && !staff.length ? <div className="management-state"><AlertCircle size={22}/><strong>Staff list unavailable</strong><button className="secondary-button" onClick={() => { setLoading(true); setError(""); void loadStaff(); }}>Try again</button></div> : !staff.length ? <div className="management-state"><UserRound size={23}/><strong>No staff members yet</strong><span>Add an intake staff member or handler to get started.</span><button className="primary-button" onClick={openCreate}><Plus size={15}/> Add staff</button></div> : !filteredStaff.length ? <div className="management-state"><Search size={23}/><strong>No matching staff members</strong><span>Try changing your search or filters.</span></div> : <div className="table-scroll"><table><thead><tr><th>STAFF MEMBER</th><th>ROLE</th><th>SPECIALIZATION</th><th>ASSIGNED INQUIRIES</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{filteredStaff.map((member) => <tr key={member.id}><td><span className="customer-cell"><span className="customer-avatar">{member.full_name.slice(0,1).toUpperCase()}</span><span className="staff-name"><strong>{member.full_name}</strong><small>{member.email}</small></span></span></td><td>{readableLabel(member.role)}</td><td>{member.specialization ? readableLabel(member.specialization) : "-"}</td><td>{member.assigned_inquiry_count}</td><td><span className={`assignment-state ${member.is_active ? "is-assigned" : "is-unassigned"}`}>{member.is_active ? "Active" : "Inactive"}</span></td><td><button className="secondary-button staff-actions-trigger" onClick={() => setActionsTarget(member)}><MoreHorizontal size={15}/>Actions</button></td></tr>)}</tbody></table></div>}
    </section>
    {dialogOpen && <StaffDialog editing={editing} form={form} setForm={setForm} categories={activeCategories} saving={saving} error={error} close={closeDialog} save={save}/>}
    {actionsTarget && <div className="modal-backdrop staff-actions-backdrop" role="presentation" onClick={() => setActionsTarget(null)}><section className="inquiry-modal staff-actions-dialog" role="dialog" aria-modal="true" aria-labelledby="staff-actions-title" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="panel-kicker">TEAM ACCOUNT</span><h2 id="staff-actions-title">Manage staff member</h2><p>{actionsTarget.full_name} · {actionsTarget.email}</p></div><button className="icon-button" onClick={() => setActionsTarget(null)} aria-label="Close staff actions"><X size={19}/></button></div><div className="staff-action-options"><button onClick={() => { const member = actionsTarget; setActionsTarget(null); openEdit(member); }}><Pencil size={17}/><span><strong>Update details</strong><small>Edit name, email, and specialization</small></span></button><button onClick={() => void resetPassword(actionsTarget)} disabled={resettingId === actionsTarget.id}><KeyRound size={17}/><span><strong>{resettingId === actionsTarget.id ? "Generating password..." : "Regenerate password"}</strong><small>Create a new temporary password and sign out active sessions</small></span></button><button onClick={() => { const member = actionsTarget; setActionsTarget(null); void toggleActive(member); }}><ShieldCheck size={17}/><span><strong>{actionsTarget.is_active ? "Deactivate account" : "Activate account"}</strong><small>{actionsTarget.is_active ? "Block sign-in and new assignments" : "Restore sign-in and assignment access"}</small></span></button><button className="danger-action" onClick={() => void deleteStaffMember(actionsTarget)}><Trash2 size={17}/><span><strong>Delete staff member</strong><small>Remove account if it has no inquiry history</small></span></button></div><div className="form-actions"><button className="secondary-button" onClick={() => setActionsTarget(null)}>Close</button></div></section></div>}
  </div>;
}

function StaffDialog({ editing, form, setForm, categories, saving, error, close, save }: { editing: StaffMember | null; form: StaffForm; setForm: (form: StaffForm) => void; categories: StaffCategory[]; saving: boolean; error: string; close: () => void; save: (event: FormEvent<HTMLFormElement>) => void }) {
  const options = categories.map((category) => category.name);
  if (form.specialization && !options.includes(form.specialization)) options.push(form.specialization);
  return <div className="modal-backdrop" role="presentation" onClick={close}><section className="inquiry-modal staff-dialog" role="dialog" aria-modal="true" aria-labelledby="staff-dialog-title" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="panel-kicker">TEAM ACCOUNT</span><h2 id="staff-dialog-title">{editing ? "Edit staff member" : "Add staff member"}</h2></div><button className="icon-button" type="button" onClick={close} aria-label="Close staff form"><X size={19}/></button></div><form onSubmit={save}><label className="form-field"><span>Full name</span><input required maxLength={120} value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} autoComplete="name"/></label><label className="form-field"><span>Email address</span><input type="email" required maxLength={254} pattern="[^\s@]+@[^\s@]+\.[^\s@]+" title="Enter an email address that includes @ and a domain." value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email"/></label>{!editing && <p className="generated-password-note">A secure temporary password will be generated automatically and shown once after account creation.</p>}<label className="form-field"><span>Role</span><select required value={form.role} disabled={Boolean(editing)} onChange={(event) => setForm({ ...form, role: event.target.value as StaffForm["role"], specialization: "" })}><option value="INTAKE">Intake</option><option value="HANDLER">Handler</option></select></label>{form.role === "HANDLER" && <label className="form-field"><span>Specialization</span><select required value={form.specialization} onChange={(event) => setForm({ ...form, specialization: event.target.value })}><option value="">Select specialization</option>{options.map((value) => <option key={value} value={value}>{readableLabel(value)}{!categories.some((category) => category.name === value) ? " (inactive)" : ""}</option>)}</select>{!categories.length && <small>Add an active category before creating a handler.</small>}</label>}{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button type="submit" className="primary-button" disabled={saving || (form.role === "HANDLER" && !categories.length)}>{saving ? "Savingâ€¦" : editing ? "Save changes" : "Create staff account"}</button></div></form></section></div>;
}
