"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, ClipboardList, LoaderCircle, UserRoundX, X } from "lucide-react";
import { apiRequest, displayDate, inquiryReference, readableLabel } from "../../../../lib/admin";

type Handler = { id: number; full_name: string; role: "INTAKE" | "HANDLER"; is_active: boolean; specialization?: string | null };
type Reassignment = { id: number; customer_name: string; subject: string; category: string; status: string; handler_response_status: string; decline_reason: string | null; created_at: string; declined_at: string | null; previous_handler: string | null };

export default function DeclinedClient() {
  const [declined, setDeclined] = useState<Reassignment[]>([]);
  const [handlers, setHandlers] = useState<Handler[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [reassignTo, setReassignTo] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [focusInquiry, setFocusInquiry] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      const [declinedResult, staffResult, categoryResult] = await Promise.all([
        apiRequest<Reassignment[]>("/api/admin/reassignment-requests"),
        apiRequest<Handler[]>("/api/admin/staff"),
        apiRequest<{ name: string }[]>("/api/inquiries/categories"),
      ]);
      setDeclined(declinedResult.data ?? []);
      setHandlers((staffResult.data ?? []).filter((staff) => staff.role === "HANDLER" && staff.is_active));
      setCategories((categoryResult.data ?? []).map((category) => category.name));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load declined inquiries."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    const inquiryId = Number(new URLSearchParams(window.location.search).get("inquiry"));
    if (Number.isSafeInteger(inquiryId) && inquiryId > 0) setFocusInquiry(inquiryId);
    void load();
  }, []);

  async function changeCategory(item: Reassignment, category: string) {
    if (category === item.category) return;
    setError(""); setNotice("");
    try {
      await apiRequest(`/api/admin/reassignment-requests/${item.id}/category`, { method: "PATCH", body: JSON.stringify({ category }) });
      setDeclined((current) => current.map((row) => row.id === item.id ? { ...row, category } : row));
      setReassignTo((current) => ({ ...current, [item.id]: "" }));
      setNotice(`${inquiryReference(item.id)} category updated. Choose a handler specialized in ${readableLabel(category)}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Category update failed."); }
  }

  async function reassign(item: Reassignment) {
    const target = reassignTo[item.id];
    if (!target) { setError("Choose an active handler with the matching specialization."); return; }
    setSavingId(item.id); setError(""); setNotice("");
    try {
      await apiRequest(`/api/admin/reassignment-requests/${item.id}/reassign`, { method: "POST", body: JSON.stringify({ handler_id: Number(target) }) });
      setDeclined((current) => current.filter((row) => row.id !== item.id));
      setNotice(`${inquiryReference(item.id)} reassigned successfully.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Reassignment failed."); }
    finally { setSavingId(null); }
  }

  return <div className="page-content management-page">
    <div className="management-heading"><div><p className="eyebrow"><span className="eyebrow-dot"/> HANDLER WORK QUEUE</p><h2>Unassigned and declined inquiries</h2><p>Assign an active handler to unassigned inquiries. For declined assignments, review the highlighted reason and change the category if needed.</p></div><span className="record-count">{declined.length} inquiries</span></div>
    {notice && <div className="feedback success-feedback" role="status"><Check size={16}/>{notice}<button aria-label="Dismiss message" onClick={() => setNotice("")}><X size={15}/></button></div>}
    {error && <div className="feedback error-feedback" role="alert"><AlertCircle size={16}/>{error}<button aria-label="Dismiss error" onClick={() => setError("")}><X size={15}/></button></div>}
    <section className="management-card">
      <div className="management-toolbar"><div><strong>Unassigned inquiries</strong><p>Handlers must be active and specialized in the inquiry category.</p></div><span className="record-count">{declined.length} inquiries</span></div>
      {loading ? <div className="management-state"><LoaderCircle className="state-spinner" size={22}/>Loading inquiries…</div> : !declined.length ? <div className="management-state"><UserRoundX size={23}/><strong>No unassigned inquiries</strong><span>New or declined inquiries without a handler will appear here.</span></div> : <div className="table-scroll"><table><thead><tr><th>REFERENCE / CUSTOMER</th><th>CATEGORY</th><th>PREVIOUS HANDLER</th><th>DECLINE REASON</th><th>LAST ACTION</th><th>ASSIGN HANDLER</th></tr></thead><tbody>{declined.map((item) => {
        const eligibleHandlers = handlers.filter((handler) => handler.specialization === item.category);
        return <tr key={item.id} className={focusInquiry === item.id ? "target-inquiry" : undefined}><td><strong>{inquiryReference(item.id)}</strong><br/>{item.customer_name}<br/><small>{item.subject}</small></td><td><select value={item.category} onChange={(event) => void changeCategory(item, event.target.value)} aria-label={`Change category for ${inquiryReference(item.id)}`}>{Array.from(new Set([item.category, ...categories])).map((category) => <option key={category} value={category}>{readableLabel(category)}{category === item.category && !categories.includes(category) ? " (inactive)" : ""}</option>)}</select></td><td>{item.previous_handler ?? "—"}</td><td className={item.handler_response_status === "DECLINED" ? "decline-reason-cell is-declined" : "decline-reason-cell"}>{item.handler_response_status === "DECLINED" ? <><strong>Handler declined</strong><span>{item.decline_reason || "No reason provided"}</span></> : <span>Not previously assigned</span>}</td><td>{displayDate(item.declined_at ?? item.created_at)}</td><td><div className="reassign-controls"><select value={reassignTo[item.id] ?? ""} onChange={(event) => setReassignTo((current) => ({ ...current, [item.id]: event.target.value }))} aria-label={`Select handler for ${inquiryReference(item.id)}`}><option value="">Choose matching handler</option>{eligibleHandlers.map((handler) => <option key={handler.id} value={handler.id}>{handler.full_name}</option>)}</select><button className="primary-button" disabled={savingId !== null || !reassignTo[item.id] || !eligibleHandlers.some((handler) => String(handler.id) === reassignTo[item.id])} onClick={() => void reassign(item)}>{savingId === item.id ? "Saving…" : item.handler_response_status === "DECLINED" ? "Reassign" : "Assign"}</button>{!eligibleHandlers.length && <small>No active {readableLabel(item.category)} handlers.</small>}</div></td></tr>;
      })}</tbody></table></div>}
    </section>
  </div>;
}
