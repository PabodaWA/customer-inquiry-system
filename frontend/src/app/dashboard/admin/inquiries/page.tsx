"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, CircleHelp, Eye, FilterX, LoaderCircle, Search, X } from "lucide-react";
import { useAdminLayout } from "../../../../components/AdminLayout";
import { apiRequest, displayDate, INQUIRY_STATUSES, Inquiry, InquiryStatus, inquiryReference, readableLabel, STATUS_TRANSITIONS } from "../../../../lib/admin";

const PAGE_SIZE = 10;
type CategoryOption = { id: number; name: string; is_active: boolean };

export default function AllInquiriesPage() {
  const router = useRouter();
  const { search } = useAdminLayout();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const loadInquiries = useCallback(async () => {
    try {
      const [inquiryResult, categoryResult] = await Promise.all([
        apiRequest<Inquiry[]>("/api/inquiries"),
        apiRequest<CategoryOption[]>("/api/admin/categories"),
      ]);
      setInquiries(inquiryResult.data ?? []);
      setCategories(categoryResult.data ?? []);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to load inquiries.";
      setError(message);
      if (message.toLowerCase().includes("authentication")) router.replace("/");
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => { const timer = window.setTimeout(() => void loadInquiries(), 0); return () => window.clearTimeout(timer); }, [loadInquiries]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return inquiries.filter((item) => {
      const matchesQuery = !query || [item.customer_name, item.subject, inquiryReference(item.id), String(item.id)].some((value) => value.toLowerCase().includes(query));
      return matchesQuery && (!statusFilter || item.status === statusFilter) && (!categoryFilter || item.category === categoryFilter);
    });
  }, [inquiries, search, statusFilter, categoryFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  async function viewDetails(id: number) {
    setSelected(null); setDetailLoading(true);
    try {
      const result = await apiRequest<Inquiry>(`/api/inquiries/${id}`);
      setSelected(result.data ?? null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load this inquiry."); }
    finally { setDetailLoading(false); }
  }

  async function updateStatus(inquiry: Inquiry, nextStatus: InquiryStatus) {
    if (!STATUS_TRANSITIONS[inquiry.status].includes(nextStatus)) return;
    if (!window.confirm(`Change ${inquiryReference(inquiry.id)} from ${readableLabel(inquiry.status)} to ${readableLabel(nextStatus)}?`)) return;
    setUpdatingId(inquiry.id); setError(""); setNotice("");
    try {
      const result = await apiRequest<Inquiry>(`/api/inquiries/${inquiry.id}/status`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
      setInquiries((current) => current.map((item) => item.id === inquiry.id ? { ...item, ...(result.data ?? {}), status: nextStatus } : item));
      if (selected?.id === inquiry.id) setSelected((current) => current ? { ...current, status: nextStatus } : current);
      setNotice(`${inquiryReference(inquiry.id)} updated to ${readableLabel(nextStatus)}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Status update failed."); }
    finally { setUpdatingId(null); }
  }

  function clearFilters() { setStatusFilter(""); setCategoryFilter(""); setPage(1); }

  return <div className="page-content management-page">
    <div className="management-heading"><div><p className="eyebrow"><span className="eyebrow-dot"/> INQUIRY WORKSPACE</p><h2>All inquiries</h2><p>Search and manage the inquiries available to your admin account.</p></div><span className="record-count">{loading ? "Loading…" : `${filtered.length} records`}</span></div>
    {notice && <div className="feedback success-feedback" role="status"><Check size={16}/>{notice}<button aria-label="Dismiss message" onClick={() => setNotice("")}><X size={15}/></button></div>}
    {error && <div className="feedback error-feedback" role="alert"><CircleHelp size={16}/>{error}<button aria-label="Dismiss error" onClick={() => setError("")}><X size={15}/></button></div>}
    <section className="management-card">
      <div className="management-toolbar"><div className="local-search"><Search size={16}/><span>Search by reference, customer or subject using the header search</span></div><div className="filter-controls"><label><span>Status</span><select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="">All statuses</option>{INQUIRY_STATUSES.map((status) => <option key={status} value={status}>{readableLabel(status)}</option>)}</select></label><label><span>Category</span><select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }}><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.name}>{readableLabel(category.name)}{category.is_active ? "" : " (inactive)"}</option>)}</select></label><button className="secondary-button" onClick={clearFilters}><FilterX size={15}/> Clear</button></div></div>
      {loading ? <div className="management-state"><LoaderCircle className="state-spinner" size={22}/><span>Loading inquiries…</span></div> : error && !inquiries.length ? <div className="management-state"><CircleHelp size={22}/><strong>Inquiries are unavailable</strong><button className="secondary-button" onClick={() => { setLoading(true); setError(""); void loadInquiries(); }}>Try again</button></div> : !filtered.length ? <div className="management-state"><Search size={23}/><strong>{search || statusFilter || categoryFilter ? "No matching inquiries" : "No inquiries yet"}</strong><span>Try changing your search or filters.</span></div> : <div className="table-scroll"><table><thead><tr><th>REFERENCE</th><th>CUSTOMER</th><th>SUBJECT</th><th>CATEGORY</th><th>ASSIGNED STAFF</th><th>STATUS</th><th>CREATED</th><th>ACTIONS</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td><span className="ref-cell">{inquiryReference(item.id)}</span></td><td><span className="customer-cell"><span className="customer-avatar">{item.customer_name.slice(0, 1).toUpperCase()}</span><strong>{item.customer_name}</strong></span></td><td className="subject-cell">{item.subject}</td><td><span className="category-chip">{readableLabel(item.category)}</span></td><td>{item.assigned_to ? item.assigned_staff_name ?? `Staff #${item.assigned_to}` : <span className="unassigned">Unassigned</span>}</td><td><span className={`status-pill status-${item.status.toLowerCase()}`}><span/>{readableLabel(item.status)}</span></td><td className="date-cell">{displayDate(item.created_at)}</td><td><div className="row-actions"><button className="row-action" onClick={() => void viewDetails(item.id)} aria-label={`View ${inquiryReference(item.id)}`}><Eye size={16}/></button>{STATUS_TRANSITIONS[item.status].length > 0 && <select className="compact-select" aria-label={`Update status for ${inquiryReference(item.id)}`} value="" disabled={updatingId === item.id} onChange={(event) => { if (event.target.value) void updateStatus(item, event.target.value as InquiryStatus); }}><option value="">{updatingId === item.id ? "Saving…" : "Update"}</option>{STATUS_TRANSITIONS[item.status].map((status) => <option key={status} value={status}>{readableLabel(status)}</option>)}</select>}</div></td></tr>)}</tbody></table></div>}
      <div className="pagination"><span>Showing <strong>{filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(currentPage * PAGE_SIZE, filtered.length)}</strong> of <strong>{filtered.length}</strong></span><div><button className="secondary-button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={16}/> Previous</button><span>Page {currentPage} of {pageCount}</span><button className="secondary-button" aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next <ChevronRight size={16}/></button></div></div>
    </section>
    {detailLoading && <div className="modal-backdrop"><section className="inquiry-modal management-state" role="status"><LoaderCircle className="state-spinner" size={22}/>Loading inquiry details…</section></div>}
    {selected && <div className="modal-backdrop" role="presentation" onClick={() => setSelected(null)}><section className="inquiry-modal" role="dialog" aria-modal="true" aria-labelledby="inquiry-detail-title" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="panel-kicker">INQUIRY DETAILS</span><h2 id="inquiry-detail-title">{inquiryReference(selected.id)}</h2></div><button className="icon-button" onClick={() => setSelected(null)} aria-label="Close details"><X size={19}/></button></div><div className="modal-customer"><span className="customer-avatar">{selected.customer_name.slice(0, 1).toUpperCase()}</span><div><strong>{selected.customer_name}</strong><small>{selected.contact ?? "Customer"}</small></div></div><dl className="detail-list"><div><dt>Subject</dt><dd>{selected.subject}</dd></div><div><dt>Category</dt><dd>{readableLabel(selected.category)}</dd></div><div><dt>Status</dt><dd>{readableLabel(selected.status)}</dd></div><div><dt>Assigned staff</dt><dd>{selected.assigned_to ? selected.assigned_staff_name ?? `Staff #${selected.assigned_to}` : "Unassigned"}</dd></div><div><dt>Created</dt><dd>{displayDate(selected.created_at)}</dd></div><div className="description-detail"><dt>Description</dt><dd>{selected.description || "No description provided."}</dd></div></dl>{STATUS_TRANSITIONS[selected.status].map((status) => <button key={status} className="primary-button modal-status-action" disabled={updatingId === selected.id} onClick={() => void updateStatus(selected, status)}>Mark {readableLabel(status)}</button>)}</section></div>}
  </div>;
}
