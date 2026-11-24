"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, Eye, LoaderCircle, UserRoundX, X } from "lucide-react";
import { apiRequest, displayDate, inquiryReference, readableLabel } from "../../../../lib/admin";
import InquiryEvidence from "../../../../components/InquiryEvidence";

type Handler = { id: number; full_name: string; role: "INTAKE" | "HANDLER"; is_active: boolean; specialization?: string | null };
type Reassignment = { id: number; customer_name: string; subject: string; category: string; status: string; handler_response_status: string; decline_reason: string | null; created_at: string; declined_at: string | null; previous_handler: string | null };
type InquiryDetails = { id: number; customer_name: string; contact?: string; customer_email?: string | null; subject: string; description?: string; category: string; status: string; handler_response_status?: string; created_at: string; assigned_staff_name?: string | null; decline_reason?: string | null; declined_at?: string | null; previous_handler?: string | null; evidence_files?: { id: number; file_name: string; mime_type: string; data_url: string }[] };
type InquiryEvent = { id: number; action: string; new_value: string | null; created_at: string; changed_by_name: string | null };

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
  const [details, setDetails] = useState<InquiryDetails | null>(null);
  const [history, setHistory] = useState<InquiryEvent[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

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
    const timer = window.setTimeout(() => {
      const inquiryId = Number(new URLSearchParams(window.location.search).get("inquiry"));
      if (Number.isSafeInteger(inquiryId) && inquiryId > 0) setFocusInquiry(inquiryId);
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function changeCategory(item: Reassignment, category: string) {
    if (category === item.category) return;
    setError(""); setNotice("");
    try {
      await apiRequest(`/api/admin/reassignment-requests/${item.id}/category`, { method: "PATCH", body: JSON.stringify({ category }) });
      setDeclined((current) => current.map((row) => row.id === item.id ? { ...row, category } : row));
      setDetails((current) => current?.id === item.id ? { ...current, category } : current);
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
      setDetails((current) => current?.id === item.id ? null : current);
      setNotice(`${inquiryReference(item.id)} reassigned successfully.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Reassignment failed."); }
    finally { setSavingId(null); }
  }

  async function showDetails(item: Reassignment) {
    setDetailsLoading(true); setDetails(null); setHistory([]); setError("");
    try {
      const [inquiryResult, historyResult] = await Promise.all([
        apiRequest<InquiryDetails>(`/api/inquiries/${item.id}`),
        apiRequest<InquiryEvent[]>(`/api/inquiries/${item.id}/history`).catch(() => ({ data: [] as InquiryEvent[] })),
      ]);
      if (!inquiryResult.data) throw new Error("Inquiry details are unavailable.");
      setDetails({ ...inquiryResult.data, decline_reason: item.decline_reason, declined_at: item.declined_at, previous_handler: item.previous_handler });
      setHistory(historyResult.data ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load inquiry details."); }
    finally { setDetailsLoading(false); }
  }

  return <div className="page-content management-page">
    <div className="management-heading"><div><p className="eyebrow"><span className="eyebrow-dot"/> HANDLER WORK QUEUE</p><h2>Unassigned and declined inquiries</h2><p>Assign an active handler to unassigned inquiries. For declined assignments, review the highlighted reason and change the category if needed.</p></div><span className="record-count">{declined.length} inquiries</span></div>
    {notice && <div className="feedback success-feedback" role="status"><Check size={16}/>{notice}<button aria-label="Dismiss message" onClick={() => setNotice("")}><X size={15}/></button></div>}
    {error && <div className="feedback error-feedback" role="alert"><AlertCircle size={16}/>{error}<button aria-label="Dismiss error" onClick={() => setError("")}><X size={15}/></button></div>}
    <section className="management-card">
      <div className="management-toolbar"><div><strong>Unassigned inquiries</strong><p>Handlers must be active and specialized in the inquiry category.</p></div><span className="record-count">{declined.length} inquiries</span></div>
      {loading ? <div className="management-state"><LoaderCircle className="state-spinner" size={22}/>Loading inquiriesâ€¦</div> : !declined.length ? <div className="management-state"><UserRoundX size={23}/><strong>No unassigned inquiries</strong><span>New or declined inquiries without a handler will appear here.</span></div> : <div className="table-scroll"><table><thead><tr><th>REFERENCE / CUSTOMER</th><th>CATEGORY</th><th>PREVIOUS HANDLER</th><th>DECLINE REASON</th><th>LAST ACTION</th><th>DETAILS</th></tr></thead><tbody>{declined.map((item) => {
        return <tr key={item.id} className={focusInquiry === item.id ? "target-inquiry" : undefined}><td><strong>{inquiryReference(item.id)}</strong><br/>{item.customer_name}<br/><small>{item.subject}</small></td><td>{readableLabel(item.category)}</td><td>{item.previous_handler ?? "-"}</td><td className={item.handler_response_status === "DECLINED" ? "decline-reason-cell is-declined" : "decline-reason-cell"}>{item.handler_response_status === "DECLINED" ? <><strong>Handler declined</strong><span>{item.decline_reason || "No reason provided"}</span></> : <span>Not previously assigned</span>}</td><td>{displayDate(item.declined_at ?? item.created_at)}</td><td><button className="secondary-button details-button" onClick={() => void showDetails(item)} disabled={detailsLoading}>{detailsLoading ? "Loading..." : <><Eye size={14}/>Inquiry details</>}</button></td></tr>;
      })}</tbody></table></div>}
    </section>
    {details && <div className="modal-backdrop declined-details-backdrop" role="presentation" onClick={() => setDetails(null)}><section className="inquiry-modal declined-details-modal" role="dialog" aria-modal="true" aria-labelledby="declined-details-title" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="panel-kicker">INQUIRY AND DECLINE DETAILS</span><h2 id="declined-details-title">{inquiryReference(details.id)}</h2></div><button className="icon-button" onClick={() => setDetails(null)} aria-label="Close inquiry details"><X size={19}/></button></div><div className="declined-details-grid"><div><span>Customer</span><strong>{details.customer_name}</strong></div><div><span>Contact</span><strong>{details.contact || "-"}</strong></div><div><span>Email</span><strong>{details.customer_email || "-"}</strong></div><div><span>Subject</span><strong>{details.subject}</strong></div><div><span>Category</span><strong>{readableLabel(details.category)}</strong></div><div><span>Status</span><strong>{readableLabel(details.status)}</strong></div><div><span>Submitted</span><strong>{displayDate(details.created_at)}</strong></div><div><span>Previous handler</span><strong>{details.previous_handler || "Not previously assigned"}</strong></div><div><span>Declined</span><strong>{details.declined_at ? displayDate(details.declined_at) : "-"}</strong></div><div className="declined-details-description"><span>Inquiry description</span><p>{details.description || "No description provided."}</p></div></div><section className="declined-details-reason"><strong>Decline details</strong><p>{details.decline_reason || "No decline reason provided. This inquiry has not been assigned before."}</p></section><InquiryEvidence files={details.evidence_files}/><section className="declined-details-history"><h3>Activity history</h3>{history.length ? history.map((event) => <article key={event.id}><strong>{readableLabel(event.action)}</strong><span>{event.changed_by_name || "Staff"} · {displayDate(event.created_at)}</span>{event.new_value && <p>{event.new_value}</p>}</article>) : <p>No activity history available.</p>}</section><section className="declined-details-assignment"><h3>Change category or assign a handler</h3><div className="declined-details-controls"><label><span>Category</span><select value={details.category} onChange={(event) => { const item = declined.find((row) => row.id === details.id); if (item) void changeCategory(item, event.target.value); }}>{Array.from(new Set([details.category, ...categories])).map((category) => <option key={category} value={category}>{readableLabel(category)}</option>)}</select></label><label><span>Active matching handler</span><select value={reassignTo[details.id] ?? ""} onChange={(event) => setReassignTo((current) => ({ ...current, [details.id]: event.target.value }))}><option value="">Choose handler</option>{handlers.filter((handler) => handler.specialization === details.category).map((handler) => <option key={handler.id} value={handler.id}>{handler.full_name}</option>)}</select></label><button className="primary-button" disabled={savingId !== null || !reassignTo[details.id] || !handlers.some((handler) => handler.specialization === details.category && String(handler.id) === reassignTo[details.id])} onClick={() => { const item = declined.find((row) => row.id === details.id); if (item) void reassign(item); }}>{savingId === details.id ? "Assigning..." : "Reassign to handler"}</button></div></section><div className="form-actions"><button className="secondary-button" onClick={() => setDetails(null)}>Close</button></div></section></div>}
  </div>;
}
