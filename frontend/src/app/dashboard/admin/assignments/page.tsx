"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AlertCircle, Check, ClipboardList, LoaderCircle, UserRoundCheck, UserRoundX, X } from "lucide-react";
import { apiRequest, displayDate, Inquiry, inquiryReference, readableLabel } from "../../../../lib/admin";

type Handler = { id: number; full_name: string; role: "INTAKE" | "HANDLER"; is_active: boolean };

export default function AssignmentsPage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [handlers, setHandlers] = useState<Handler[]>([]);
  const [filter, setFilter] = useState<"ALL" | "ASSIGNED" | "UNASSIGNED">("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [assignTarget, setAssignTarget] = useState<Inquiry | null>(null);
  const [handlerId, setHandlerId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([apiRequest<Inquiry[]>("/api/inquiries"), apiRequest<Handler[]>("/api/admin/staff")])
      .then(([inquiryResult, staffResult]) => { if (active) { setInquiries(inquiryResult.data ?? []); setHandlers((staffResult.data ?? []).filter((staff) => staff.role === "HANDLER" && staff.is_active)); } })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load assignments."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const assigned = inquiries.filter((item) => item.assigned_to != null).length;
  const unassigned = inquiries.length - assigned;
  const rows = useMemo(() => inquiries.filter((item) => filter === "ALL" || (filter === "ASSIGNED" ? item.assigned_to != null : item.assigned_to == null)), [inquiries, filter]);

  function openAssignment(inquiry: Inquiry) { setAssignTarget(inquiry); setHandlerId(""); setError(""); }
  async function saveAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assignTarget || !/^[1-9]\d*$/.test(handlerId)) { setError("Enter a valid positive handler ID."); return; }
    const parsedId = Number(handlerId);
    if (!Number.isSafeInteger(parsedId)) { setError("Handler ID is outside the supported range."); return; }
    const verb = assignTarget.assigned_to ? "Reassign" : "Assign";
    if (!window.confirm(`${verb} ${inquiryReference(assignTarget.id)} to active handler #${parsedId}?`)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await apiRequest<Inquiry>(`/api/inquiries/${assignTarget.id}/assign`, { method: "PATCH", body: JSON.stringify({ assigned_to: parsedId }) });
      const handler = handlers.find((member) => member.id === parsedId);
      setInquiries((current) => current.map((item) => item.id === assignTarget.id ? { ...item, ...(result.data ?? {}), assigned_to: parsedId, assigned_staff_name: handler?.full_name ?? `Staff #${parsedId}` } : item));
      setNotice(`${inquiryReference(assignTarget.id)} assigned to ${handler?.full_name ?? `handler #${parsedId}`}.`);
      setAssignTarget(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Assignment failed."); }
    finally { setSaving(false); }
  }

  return <div className="page-content management-page">
    <div className="management-heading"><div><p className="eyebrow"><span className="eyebrow-dot"/> WORKLOAD</p><h2>Assignments</h2><p>Review current ownership and inquiries waiting for assignment.</p></div></div>
    <div className="summary-grid"><article className="summary-card"><span><ClipboardList size={18}/></span><div><small>Total inquiries</small><strong>{loading ? "—" : inquiries.length}</strong></div></article><article className="summary-card"><span><UserRoundCheck size={18}/></span><div><small>Assigned</small><strong>{loading ? "—" : assigned}</strong></div></article><article className="summary-card"><span><UserRoundX size={18}/></span><div><small>Unassigned</small><strong>{loading ? "—" : unassigned}</strong></div></article></div>
    {error && <div className="feedback error-feedback" role="alert"><AlertCircle size={16}/>{error}</div>}
    {notice && <div className="feedback success-feedback" role="status"><Check size={16}/>{notice}<button aria-label="Dismiss message" onClick={() => setNotice("")}><X size={15}/></button></div>}
    <section className="management-card"><div className="management-toolbar"><div><strong>Inquiry ownership</strong><p>Assignments can only be made to active handlers.</p></div><div className="filter-controls"><label><span>Show</span><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="ALL">All inquiries</option><option value="ASSIGNED">Assigned</option><option value="UNASSIGNED">Unassigned</option></select></label></div></div>
      {loading ? <div className="management-state"><LoaderCircle className="state-spinner" size={22}/>Loading assignment data…</div> : !rows.length ? <div className="management-state"><ClipboardList size={23}/><strong>No inquiries in this view</strong><span>Try selecting another assignment filter.</span></div> : <div className="table-scroll"><table><thead><tr><th>REFERENCE</th><th>CUSTOMER</th><th>SUBJECT</th><th>ASSIGNED STAFF</th><th>INQUIRY STATUS</th><th>CREATED</th><th>ASSIGNMENT</th><th/></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><span className="ref-cell">{inquiryReference(item.id)}</span></td><td><strong>{item.customer_name}</strong></td><td className="subject-cell">{item.subject}</td><td>{item.assigned_to ? <span className="assigned-cell"><span className="staff-avatar">{`S${item.assigned_to}`.slice(0,2)}</span>{item.assigned_staff_name ?? `Staff #${item.assigned_to}`}</span> : <span className="unassigned">Not assigned</span>}</td><td><span className={`status-pill status-${item.status.toLowerCase()}`}><span/>{readableLabel(item.status)}</span></td><td className="date-cell">{displayDate(item.created_at)}</td><td><span className={`assignment-state ${item.assigned_to ? "is-assigned" : "is-unassigned"}`}>{item.assigned_to ? "Assigned" : "Awaiting assignment"}</span></td><td><button className="secondary-button" onClick={() => openAssignment(item)}>{item.assigned_to ? "Reassign" : "Assign"}</button></td></tr>)}</tbody></table></div>}
      <div className="api-limitation"><AlertCircle size={16}/><p>The server validates every assignment and only accepts users with the active HANDLER role. Staff assignments are recorded by user ID with the current staff name displayed here.</p></div>
    </section>
    {assignTarget && <div className="modal-backdrop" role="presentation" onClick={() => setAssignTarget(null)}><section className="inquiry-modal" role="dialog" aria-modal="true" aria-labelledby="assignment-dialog-title" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="panel-kicker">ASSIGN INQUIRY</span><h2 id="assignment-dialog-title">{inquiryReference(assignTarget.id)}</h2></div><button className="icon-button" onClick={() => setAssignTarget(null)} aria-label="Close assignment dialog"><X size={19}/></button></div><p className="assignment-dialog-subject">{assignTarget.subject}</p><form onSubmit={saveAssignment}><label className="form-field"><span>Active handler</span><select required value={handlerId} onChange={(event) => setHandlerId(event.target.value)}><option value="">Select an active handler</option>{handlers.map((handler) => <option key={handler.id} value={handler.id}>{handler.full_name}</option>)}</select><small>The API rechecks that the selected account is an active HANDLER.</small></label>{handlers.length === 0 && <p className="form-error">There are no active handlers available. Add or activate a handler in Staff Management first.</p>}{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="secondary-button" onClick={() => setAssignTarget(null)}>Cancel</button><button type="submit" className="primary-button" disabled={saving || handlers.length === 0}>{saving ? "Saving…" : "Save assignment"}</button></div></form></section></div>}
  </div>;
}
