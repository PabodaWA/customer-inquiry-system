"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowDownRight, ArrowUpRight, Bell, ChevronRight, CircleHelp, ClipboardList, Eye, MoreHorizontal, Search, ShieldCheck, UserRoundCog, X } from "lucide-react";
import { useAdminLayout } from "../../../components/AdminLayout";

type Inquiry = {
  id: number;
  customer_name: string;
  subject: string;
  category: string;
  status: "NEW" | "IN_PROGRESS" | "RESOLVED";
  created_at: string;
  assigned_to?: number | null;
  assigned_staff_name?: string | null;
};
type StaffSummary = { is_active: boolean };

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

function formatDate(date: string) {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

export default function AdminDashboard() {
  const { user, search } = useAdminLayout();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [activeStaff, setActiveStaff] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const clockTimer = window.setTimeout(() => setNow(new Date()), 0);
    let active = true;
    async function loadInquiries() {
      try {
        const [inquiryResponse, staffResponse] = await Promise.all([
          fetch(`${apiUrl}/api/inquiries`, { credentials: "include" }),
          fetch(`${apiUrl}/api/admin/staff`, { credentials: "include" }),
        ]);
        const [inquiryResult, staffResult] = await Promise.all([
          inquiryResponse.json() as Promise<{ success?: boolean; data?: Inquiry[]; message?: string }>,
          staffResponse.json() as Promise<{ success?: boolean; data?: StaffSummary[]; message?: string }>,
        ]);
        if (!inquiryResponse.ok || !inquiryResult.success) throw new Error(inquiryResult.message ?? "Could not load inquiries.");
        if (!staffResponse.ok || !staffResult.success) throw new Error(staffResult.message ?? "Could not load staff statistics.");
        if (active) {
          setInquiries(inquiryResult.data ?? []);
          setActiveStaff((staffResult.data ?? []).filter((member) => member.is_active).length);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load your dashboard.");
      } finally { if (active) setLoading(false); }
    }
    void loadInquiries();
    return () => { active = false; window.clearTimeout(clockTimer); };
  }, []);

  const filteredInquiries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (query ? inquiries.filter((item) => [item.id, item.customer_name, item.subject, item.category, item.status, item.assigned_to].some((value) => String(value ?? "").toLowerCase().includes(query))) : inquiries).slice(0, 8);
  }, [inquiries, search]);
  const counts = {
    total: inquiries.length,
    fresh: inquiries.filter((item) => item.status === "NEW").length,
    working: inquiries.filter((item) => item.status === "IN_PROGRESS").length,
    resolved: inquiries.filter((item) => item.status === "RESOLVED").length,
  };

  return (
    <>
      <div className="page-content">
        <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot"/> ADMIN OVERVIEW</div><h2>Good {now ? (now.getHours() < 12 ? "morning" : now.getHours() < 18 ? "afternoon" : "evening") : "day"}, {user.fullName.split(" ")[0]} <span className="wave">✦</span></h2><p>Here’s what’s happening with your customer inquiries today.</p></div><div className="date-chip"><span className="date-dot"/>{now ? new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(now) : "Today"}</div></div>

        <section className="stat-grid" aria-label="Inquiry overview">
          <article className="stat-card"><div className="stat-top"><span className="stat-icon icon-teal"><ClipboardList size={19}/></span><span className="stat-trend trend-teal"><Activity size={13}/> Live</span></div><p>Total inquiries</p><strong>{loading ? "—" : counts.total.toLocaleString()}</strong><small>All customer requests</small><div className="sparkline spark-teal"><span/><span/><span/><span/><span/><span/><span/></div></article>
          <article className="stat-card"><div className="stat-top"><span className="stat-icon icon-blue"><Bell size={19}/></span><span className="stat-trend trend-blue"><ArrowUpRight size={13}/> Active queue</span></div><p>New inquiries</p><strong>{loading ? "—" : counts.fresh.toLocaleString()}</strong><small>Awaiting first response</small><div className="sparkline spark-blue"><span/><span/><span/><span/><span/><span/><span/></div></article>
          <article className="stat-card"><div className="stat-top"><span className="stat-icon icon-amber"><Activity size={19}/></span><span className="stat-trend trend-amber"><ArrowUpRight size={13}/> In progress</span></div><p>In progress</p><strong>{loading ? "—" : counts.working.toLocaleString()}</strong><small>Currently being handled</small><div className="sparkline spark-amber"><span/><span/><span/><span/><span/><span/><span/></div></article>
          <article className="stat-card"><div className="stat-top"><span className="stat-icon icon-green"><ShieldCheck size={19}/></span><span className="stat-trend trend-green"><ArrowDownRight size={13}/> Completed</span></div><p>Resolved</p><strong>{loading ? "—" : counts.resolved.toLocaleString()}</strong><small>Successfully closed</small><div className="sparkline spark-green"><span/><span/><span/><span/><span/><span/><span/></div></article>
        </section>

        <section className="status-distribution" aria-label="Inquiry status distribution"><div><strong>Inquiry status distribution</strong><span>{loading ? "Loading" : `${counts.total} total inquiries`}</span></div><div className="distribution-bar" role="img" aria-label={`New ${counts.fresh}, in progress ${counts.working}, resolved ${counts.resolved}`}><span className="distribution-new" style={{ width: `${counts.total ? counts.fresh / counts.total * 100 : 0}%` }}/><span className="distribution-progress" style={{ width: `${counts.total ? counts.working / counts.total * 100 : 0}%` }}/><span className="distribution-resolved" style={{ width: `${counts.total ? counts.resolved / counts.total * 100 : 0}%` }}/></div><div className="distribution-legend"><span><i className="legend-new"/>New <strong>{loading ? "—" : counts.fresh}</strong></span><span><i className="legend-progress"/>In progress <strong>{loading ? "—" : counts.working}</strong></span><span><i className="legend-resolved"/>Resolved <strong>{loading ? "—" : counts.resolved}</strong></span></div></section>

        <section className="team-strip" id="staff"><div className="team-icon"><UserRoundCog size={19}/></div><div className="team-copy"><strong>Active staff</strong><span>Enabled intake staff and handlers.</span></div><div className="team-count">{activeStaff ?? "—"} <small>active members</small></div></section>

        <section className="inquiries-panel" id="recent-inquiries"><div className="panel-head"><div><div className="panel-kicker">INBOX</div><h3>Recent inquiries <span className="result-count">{loading ? "" : inquiries.length}</span></h3><p>Keep track of the latest customer conversations.</p></div><Link className="view-all" href="/dashboard/admin/inquiries">View all inquiries <ChevronRight size={15}/></Link></div>
          {error ? <div className="table-state"><span className="state-icon"><CircleHelp size={20}/></span><strong>We couldn’t load the dashboard</strong><p>{error}</p><button onClick={() => window.location.reload()}>Try again</button></div> : loading ? <div className="table-state"><span className="loading-ring"/><p>Loading your inquiry data...</p></div> : filteredInquiries.length === 0 ? <div className="table-state"><span className="state-icon"><Search size={20}/></span><strong>{search ? "No matching inquiries" : "No inquiries yet"}</strong><p>{search ? "Try a different search term." : "New customer requests will appear here."}</p></div> : <div className="table-scroll"><table><thead><tr><th>REFERENCE</th><th>CUSTOMER</th><th>SUBJECT</th><th>CATEGORY</th><th>ASSIGNED TO</th><th>STATUS</th><th>CREATED</th><th/></tr></thead><tbody>{filteredInquiries.map((inquiry) => <tr key={inquiry.id}><td><span className="ref-cell">CN-{String(inquiry.id).padStart(4, "0")}</span></td><td><span className="customer-cell"><span className="customer-avatar">{initials(inquiry.customer_name)}</span><strong>{inquiry.customer_name}</strong></span></td><td className="subject-cell">{inquiry.subject}</td><td><span className="category-chip">{inquiry.category.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())}</span></td><td>{inquiry.assigned_to ? <span className="assigned-cell"><span className="staff-avatar">{`S${inquiry.assigned_to}`.slice(0,2)}</span>{inquiry.assigned_staff_name ?? `Staff #${inquiry.assigned_to}`}</span> : <span className="unassigned">Unassigned</span>}</td><td><span className={`status-pill status-${inquiry.status.toLowerCase()}`}><span/>{inquiry.status.replace("_", " ").toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase())}</span></td><td className="date-cell">{formatDate(inquiry.created_at)}</td><td><button className="row-action" onClick={() => setSelectedInquiry(inquiry)} aria-label={`View inquiry CN-${inquiry.id}`}><Eye size={16}/></button></td></tr>)}</tbody></table></div>}
          <div className="panel-footer"><span>Showing <strong>{filteredInquiries.length}</strong> of <strong>{inquiries.length}</strong> inquiries</span><button aria-label="More inquiry options"><MoreHorizontal size={19}/></button></div>
        </section>
        <footer className="page-footer"><span>© {now?.getFullYear() ?? ""} Coffee Ninja</span><span>Customer care, brewed better.</span></footer>
      </div>
      {selectedInquiry && <div className="modal-backdrop" role="presentation" onClick={() => setSelectedInquiry(null)}><section className="inquiry-modal" role="dialog" aria-modal="true" aria-labelledby="inquiry-modal-title" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="panel-kicker">INQUIRY DETAILS</span><h2 id="inquiry-modal-title">CN-{String(selectedInquiry.id).padStart(4, "0")}</h2></div><button className="icon-button" onClick={() => setSelectedInquiry(null)} aria-label="Close inquiry details"><X size={19}/></button></div><div className="modal-customer"><span className="customer-avatar">{initials(selectedInquiry.customer_name)}</span><div><strong>{selectedInquiry.customer_name}</strong><small>Customer</small></div></div><dl className="detail-list"><div><dt>Subject</dt><dd>{selectedInquiry.subject}</dd></div><div><dt>Category</dt><dd>{selectedInquiry.category}</dd></div><div><dt>Assigned to</dt><dd>{selectedInquiry.assigned_to ? `Staff #${selectedInquiry.assigned_to}` : "Unassigned"}</dd></div><div><dt>Status</dt><dd>{selectedInquiry.status.replace("_", " ")}</dd></div><div><dt>Created</dt><dd>{formatDate(selectedInquiry.created_at)}</dd></div></dl><button className="modal-done" onClick={() => setSelectedInquiry(null)}>Done</button></section></div>}
    </>
  );
}
