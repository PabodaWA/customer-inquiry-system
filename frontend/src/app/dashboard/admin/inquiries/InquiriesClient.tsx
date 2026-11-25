"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CircleHelp, Eye, FilterX, LoaderCircle, Search, X } from "lucide-react";
import { apiRequest, displayDate, INQUIRY_STATUSES, Inquiry, inquiryReference, readableLabel } from "../../../../lib/admin";
import { useInquiryRefresh } from "../../../../lib/useInquiryRefresh";
import InquiryEvidence from "../../../../components/InquiryEvidence";

const PAGE_SIZE = 10;
type CategoryOption = { id: number; name: string; is_active: boolean };
type InquiryDetails = Inquiry & { decline_reason?: string | null; accepted_at?: string | null; resolved_at?: string | null; created_by?: number; created_by_name?: string | null };
type InquiryHistory = { id: number; action: string; old_value?: string | null; new_value?: string | null; changed_by_name?: string | null; created_at: string };

function displayTimestamp(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function AllInquiriesPage() {
  const router = useRouter();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<InquiryDetails | null>(null);
  const [history, setHistory] = useState<InquiryHistory[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadInquiries = useCallback(async () => {
    try {
      const [inquiryResult, categoryResult] = await Promise.all([
        apiRequest<Inquiry[]>("/api/inquiries"),
        apiRequest<CategoryOption[]>("/api/admin/categories"),
      ]);
      const currentInquiries = inquiryResult.data ?? [];
      setInquiries(currentInquiries);
      setSelected((current) => {
        const latest = currentInquiries.find((item) => item.id === current?.id);
        return latest && current ? { ...current, ...latest } : current;
      });
      setCategories(categoryResult.data ?? []);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to load inquiries.";
      setError(message);
      if (message.toLowerCase().includes("authentication")) router.replace("/");
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => { const timer = window.setTimeout(() => void loadInquiries(), 0); return () => window.clearTimeout(timer); }, [loadInquiries]);
  useInquiryRefresh(loadInquiries);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return inquiries.filter((item) => {
      const matchesSearch = !query || [
        inquiryReference(item.id), item.customer_name, item.subject, item.category,
        item.assigned_staff_name, item.status,
      ].some((value) => value?.toLocaleLowerCase().includes(query));
      return matchesSearch && (!statusFilter || item.status === statusFilter) && (!categoryFilter || item.category === categoryFilter);
    });
  }, [inquiries, searchQuery, statusFilter, categoryFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  async function viewDetails(id: number) {
    setSelected(null); setHistory([]); setDetailLoading(true);
    try {
      const [result, historyResult] = await Promise.all([
        apiRequest<InquiryDetails>(`/api/inquiries/${id}`),
        apiRequest<InquiryHistory[]>(`/api/inquiries/${id}/history`).catch(() => ({ data: [] as InquiryHistory[] })),
      ]);
      setSelected(result.data ?? null);
      setHistory(historyResult.data ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load this inquiry."); }
    finally { setDetailLoading(false); }
  }

  function clearFilters() { setSearchQuery(""); setStatusFilter(""); setCategoryFilter(""); setPage(1); }

  return <div className="page-content management-page">
    <div className="management-heading"><div><p className="eyebrow"><span className="eyebrow-dot"/> INQUIRY WORKSPACE</p><h2>All inquiries</h2><p>Manage the inquiries available to your admin account.</p></div><span className="record-count">{loading ? "Loading…" : `${filtered.length} records`}</span></div>
    {error && <div className="feedback error-feedback" role="alert"><CircleHelp size={16}/>{error}<button aria-label="Dismiss error" onClick={() => setError("")}><X size={15}/></button></div>}
    <section className="management-card">
      <div className="management-toolbar"><div className="filter-controls"><label className="inquiry-search"><span>Search inquiries</span><span className="inquiry-search-input"><Search size={15}/><input type="search" value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); setPage(1); }} placeholder="Reference, customer, subject…" aria-label="Search inquiries"/></span></label><label><span>Status</span><select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="">All statuses</option>{INQUIRY_STATUSES.map((status) => <option key={status} value={status}>{readableLabel(status)}</option>)}</select></label><label><span>Category</span><select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }}><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.name}>{readableLabel(category.name)}{category.is_active ? "" : " (inactive)"}</option>)}</select></label><button className="secondary-button" onClick={clearFilters}><FilterX size={15}/> Clear</button></div></div>
      {loading ? <div className="management-state"><LoaderCircle className="state-spinner" size={22}/><span>Loading inquiries…</span></div> : error && !inquiries.length ? <div className="management-state"><CircleHelp size={22}/><strong>Inquiries are unavailable</strong><button className="secondary-button" onClick={() => { setLoading(true); setError(""); void loadInquiries(); }}>Try again</button></div> : !filtered.length ? <div className="management-state"><Search size={23}/><strong>{statusFilter || categoryFilter ? "No matching inquiries" : "No inquiries yet"}</strong><span>Try changing your filters.</span></div> : <div className="table-scroll"><table><thead><tr><th>REFERENCE</th><th>CUSTOMER</th><th>SUBJECT</th><th>CATEGORY</th><th>ASSIGNED STAFF</th><th>STATUS</th><th>CREATED</th><th>ACTIONS</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td><span className="ref-cell">{inquiryReference(item.id)}</span></td><td><span className="customer-cell"><span className="customer-avatar">{item.customer_name.slice(0, 1).toUpperCase()}</span><strong>{item.customer_name}</strong></span></td><td className="subject-cell">{item.subject}</td><td><span className="category-chip">{readableLabel(item.category)}</span></td><td>{item.assigned_to ? item.assigned_staff_name ?? `Staff #${item.assigned_to}` : <span className="unassigned">Unassigned</span>}</td><td><span className={`status-pill status-${item.status.toLowerCase()}`}><span/>{readableLabel(item.status)}</span></td><td className="date-cell">{displayDate(item.created_at)}</td><td><div className="row-actions"><button className="secondary-button details-button" onClick={() => void viewDetails(item.id)} aria-label={`View all details for ${inquiryReference(item.id)}`}><Eye size={15}/> Details</button>{item.assigned_to == null && <button className="primary-button details-button" onClick={() => router.push(`/dashboard/admin/declined?inquiry=${item.id}`)}>Assign</button>}</div></td></tr>)}</tbody></table></div>}
      <div className="pagination"><span>Showing <strong>{filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(currentPage * PAGE_SIZE, filtered.length)}</strong> of <strong>{filtered.length}</strong></span><div><button className="secondary-button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={16}/> Previous</button><span>Page {currentPage} of {pageCount}</span><button className="secondary-button" aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next <ChevronRight size={16}/></button></div></div>
    </section>
    {detailLoading && <div className="modal-backdrop"><section className="inquiry-modal management-state" role="status"><LoaderCircle className="state-spinner" size={22}/>Loading inquiry details…</section></div>}
    {selected && <div className="modal-backdrop" role="presentation" onClick={() => setSelected(null)}>
      <section className="inquiry-modal inquiry-details-modal" role="dialog" aria-modal="true" aria-labelledby="inquiry-detail-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading"><div><span className="panel-kicker">CURRENT INQUIRY DETAILS</span><h2 id="inquiry-detail-title">{inquiryReference(selected.id)}</h2></div><button className="icon-button" onClick={() => setSelected(null)} aria-label="Close details"><X size={19}/></button></div>
        <div className="modal-customer"><span className="customer-avatar">{selected.customer_name.slice(0, 1).toUpperCase()}</span><div><strong>{selected.customer_name}</strong><small>{selected.contact || "No contact details provided"}{selected.customer_email ? ` | ${selected.customer_email}` : ""}</small></div></div>
        <dl className="detail-list">
          <div><dt>Subject</dt><dd>{selected.subject}</dd></div><div><dt>Category</dt><dd>{readableLabel(selected.category)}</dd></div><div><dt>Inquiry status</dt><dd>{readableLabel(selected.status)}</dd></div>
          <div><dt>Assignment</dt><dd>{selected.assigned_to ? `Assigned  ·  ${selected.assigned_staff_name ?? `Handler #${selected.assigned_to}`}` : "Unassigned"}</dd></div><div><dt>Handler response</dt><dd>{readableLabel(selected.handler_response_status ?? "UNKNOWN")}</dd></div>
          <div><dt>Created</dt><dd>{displayTimestamp(selected.created_at)}</dd></div><div><dt>Last updated</dt><dd>{displayTimestamp(selected.updated_at)}</dd></div>
          {selected.accepted_at && <div><dt>Accepted</dt><dd>{displayTimestamp(selected.accepted_at)}</dd></div>}{selected.resolved_at && <div><dt>Resolved</dt><dd>{displayTimestamp(selected.resolved_at)}</dd></div>}{selected.created_by != null && <div><dt>Created by</dt><dd>{selected.created_by_name ?? `User #${selected.created_by}`}</dd></div>}
          {selected.decline_reason && <div className="description-detail"><dt>Decline reason</dt><dd>{selected.decline_reason}</dd></div>}
          <div className="description-detail"><dt>Description</dt><dd>{selected.description || "No description provided."}</dd></div>
        </dl>
        <section className="inquiry-history"><h3>Activity history</h3>{history.length ? <ol>{history.map((event) => <li key={event.id}><strong>{event.action === "STATUS_CHANGED" && event.new_value ? `Status changed to ${readableLabel(event.new_value)}` : readableLabel(event.action)}</strong><span>{event.changed_by_name ? `By ${event.changed_by_name}` : "System update"}{event.old_value && event.new_value ? `  ·  ${readableLabel(event.old_value)} ? ${readableLabel(event.new_value)}` : ""}</span><time>{displayTimestamp(event.created_at)}</time></li>)}</ol> : <p>No activity history is available.</p>}</section>
        <InquiryEvidence files={selected.evidence_files}/>
      </section>
    </div>}
  </div>;
}
