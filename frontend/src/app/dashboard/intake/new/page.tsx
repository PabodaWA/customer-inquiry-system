"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, CloudUpload, FilePlus2, LayoutDashboard, LogOut, Menu, Settings, X } from "lucide-react";
import ThemeToggle from "../../../../components/ThemeToggle";
import { apiRequest, inquiryReference, readableLabel, type Inquiry } from "../../../../lib/admin";
import { useLogout } from "../../../../lib/useLogout";
import LogoutFeedback from "../../../../components/LogoutFeedback";
import "../intake.css";

type User = { id: number; fullName: string; email: string; role: string };
type Category = { name: string; is_active: boolean };
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
type FormValues = { customer_name: string; customer_email: string; contact: string; subject: string; category: string; description: string };
type EvidenceFile = { name: string; type: string; data: string };
const emptyForm: FormValues = { customer_name: "", customer_email: "", contact: "", subject: "", category: "", description: "" };
const allowedEvidenceTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

export default function NewIntakeInquiryPage() {
  const router = useRouter();
  const { logout, error: logoutError } = useLogout();
  const [user, setUser] = useState<User | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [values, setValues] = useState(emptyForm);
  const [evidence, setEvidence] = useState<File[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Inquiry | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`${apiUrl}/api/auth/me`, { credentials: "include" });
          const result = await response.json() as { user?: User };
          if (!response.ok || !result.user) { router.replace("/"); return; }
          if (result.user.role !== "INTAKE") { router.replace(result.user.role === "ADMIN" ? "/dashboard/admin" : "/dashboard/handler"); return; }
          if (active) setUser(result.user);
          const categoryResult = await apiRequest<Category[]>("/api/inquiries/categories");
          if (active) setCategories((categoryResult.data ?? []).filter((item) => item.is_active));
        } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Unable to load inquiry categories."); }
        finally { if (active) setLoading(false); }
      })();
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [router]);

  function validate() {
    const next: Partial<Record<keyof FormValues, string>> = {};
    const contact = values.contact.trim();
    const digits = contact.replace(/\D/g, "");
    const validPhone = /^\+?[\d\s().-]{7,24}$/.test(contact) && digits.length >= 7 && digits.length <= 15;
    if (!values.customer_name.trim()) next.customer_name = "Enter the customer’s name.";
    else if (values.customer_name.trim().length < 2 || values.customer_name.trim().length > 120) next.customer_name = "Name must be between 2 and 120 characters.";
    if (!contact) next.contact = "Enter a contact number.";
    else if (!validPhone) next.contact = "Enter a valid phone number with 7–15 digits.";
    if (!values.subject.trim()) next.subject = "Enter an inquiry subject.";
    else if (values.subject.trim().length < 3 || values.subject.trim().length > 160) next.subject = "Subject must be between 3 and 160 characters.";
    if (!values.category) next.category = "Choose an inquiry category.";
    if (values.customer_email.trim() && (values.customer_email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.customer_email.trim()))) next.customer_email = "Enter a valid customer email address.";
    if (!values.description.trim()) next.description = "Add a short description of the inquiry.";
    else if (values.description.trim().length < 10 || values.description.trim().length > 5000) next.description = "Description must be between 10 and 5,000 characters.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setCreated(null);
    if (!validate()) return;
    setSaving(true);
    try {
      const evidenceFiles: EvidenceFile[] = await Promise.all(evidence.map(async (file) => ({ name: file.name, type: file.type, data: await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.onerror = () => reject(new Error(`Could not read ${file.name}.`)); reader.readAsDataURL(file); }) })));
      const result = await apiRequest<Inquiry>("/api/inquiries", { method: "POST", body: JSON.stringify({ ...values, customer_name: values.customer_name.trim(), customer_email: values.customer_email.trim(), contact: values.contact.trim(), subject: values.subject.trim(), description: values.description.trim(), evidence_files: evidenceFiles }) });
      const inquiry = result.data;
      if (!inquiry) throw new Error("The inquiry was submitted, but its reference could not be read.");
      setCreated(inquiry); setValues(emptyForm); setEvidence([]); setErrors({});
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Inquiry registration failed. Please try again."); }
    finally { setSaving(false); }
  }


  function field<K extends keyof FormValues>(name: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [name]: value }));
    if (errors[name]) setErrors((current) => ({ ...current, [name]: undefined }));
  }

  function selectEvidence(files: File[]) {
    const pictures = files.filter((file) => file.type.startsWith("image/")).length;
    const documents = files.length - pictures;
    if (pictures > 3 || documents > 3) { setError("Choose up to 3 pictures and up to 3 documents."); return; }
    if (files.some((file) => !allowedEvidenceTypes.includes(file.type) || file.size > 5 * 1024 * 1024)) {
      setError("Use JPG, PNG, WEBP, PDF, TXT, DOC, or DOCX files up to 5 MB each."); return;
    }
    setError(""); setEvidence(files);
  }

  return <div className="intake-app">
    <LogoutFeedback error={logoutError} onRetry={() => void logout()}/>
    {mobileNav && <button className="intake-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className={`intake-sidebar ${mobileNav ? "is-open" : ""}`}>
      <Link href="/dashboard/intake" className="intake-brand"><span className="intake-brand-icon"><img src="/cofee.png" alt="" /></span><span><small>INQUIRY PORTAL</small></span><button className="intake-close" aria-label="Close menu" onClick={(event) => { event.preventDefault(); setMobileNav(false); }}><X size={18}/></button></Link>
      <div className="intake-nav-label">WORKSPACE</div><nav className="intake-nav" aria-label="Main navigation">
        <Link href="/dashboard/intake"><LayoutDashboard size={18}/>Dashboard</Link><Link href="/dashboard/intake/inquiries"><ClipboardList size={18}/>My created inquiries</Link><Link className="current" aria-current="page" href="/dashboard/intake/new"><FilePlus2 size={18}/>New inquiry</Link><Link href="/dashboard/intake/notifications"><Bell size={18}/>Notifications</Link>
      </nav><div className="intake-nav-label settings-label">PREFERENCES</div><nav className="intake-nav"><Link href="/dashboard/intake/settings"><Settings size={18}/>Settings</Link></nav>
      <div className="intake-sidebar-profile"><span className="intake-avatar">{initials(user?.fullName ?? "Staff")}</span><span className="intake-profile-name"><strong>{user?.fullName ?? "Intake Staff"}</strong><small>Intake Staff</small></span><button className="intake-logout" aria-label="Log out" onClick={() => void logout()}><LogOut size={17}/></button></div>
    </aside>
    <main className="intake-main">
      <header className="intake-topbar"><button className="intake-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={20}/></button><div className="intake-breadcrumb"><Link href="/dashboard/intake">Workspace</Link><ChevronRight size={14}/><strong>New inquiry</strong></div><div className="intake-top-tools"><button className="intake-icon-button intake-bell" aria-label="Notifications"><Bell size={18}/></button><ThemeToggle className="intake-icon-button"/><div className="intake-profile-menu-wrap"><button className="intake-top-profile" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}><span className="intake-avatar">{initials(user?.fullName ?? "Staff")}</span><span><strong>{user?.fullName ?? "Staff"}</strong><small>Intake Staff</small></span><ChevronDown size={15}/></button>{profileOpen && <div className="intake-profile-dropdown"><strong>{user?.fullName ?? "Staff"}</strong><small>{user?.email ?? ""}</small><button onClick={() => { setProfileOpen(false); void logout(); }}><LogOut size={14}/> Log out</button></div>}</div></div></header>
      <div className="intake-content new-inquiry-content"><div className="intake-heading"><div><p className="intake-kicker">CUSTOMER INTAKE</p><h1>New inquiry</h1><p>Capture the customer’s request and send it to the inquiry team.</p></div><Link className="intake-back-link" href="/dashboard/intake/inquiries"><ClipboardList size={15}/>View all inquiries</Link></div>
        {error && <div className="new-form-error" role="alert"><X size={16}/>{error}</div>}
        {created && <div className="intake-modal-backdrop" role="presentation" onClick={() => setCreated(null)}><section className="intake-modal inquiry-success-modal" role="dialog" aria-modal="true" aria-labelledby="inquiry-success-title" onClick={(event) => event.stopPropagation()}><div className="inquiry-success-icon"><CheckCircle2 size={25}/></div><h2 id="inquiry-success-title">Inquiry created successfully</h2><p className="inquiry-success-reference">Reference <strong>{inquiryReference(created.id)}</strong></p><p>{created.assignment_status === "ASSIGNED" ? `Automatically assigned to ${created.assigned_staff_name ?? `handler #${created.assigned_to}`}. Waiting for handler acceptance.` : "No eligible handler is currently available. The inquiry is pending assignment."}</p><div className="inquiry-success-description"><strong>Description</strong><p>{created.description || "No description provided."}</p></div><button className="intake-modal-done" autoFocus onClick={() => setCreated(null)}>Okay</button></section></div>}
        <section className="new-form-card"><div className="new-form-card-head"><span className="intake-stat-icon teal"><FilePlus2 size={18}/></span><div><h2>Customer inquiry details</h2><p>Fields marked with <b>*</b> are required.</p></div></div>
          {loading ? <div className="intake-empty">Loading inquiry categories…</div> : <form className="new-inquiry-form" onSubmit={(event) => void submit(event)} noValidate>
            <label className="new-field"><span>Customer name <b>*</b></span><input autoComplete="name" minLength={2} maxLength={120} value={values.customer_name} onChange={(event) => field("customer_name", event.target.value)} aria-invalid={Boolean(errors.customer_name)} aria-describedby={errors.customer_name ? "customer-name-error" : undefined} placeholder="Enter customer’s full name"/>{errors.customer_name && <small id="customer-name-error">{errors.customer_name}</small>}</label>
            <label className="new-field"><span>Contact number <b>*</b></span><input type="tel" autoComplete="tel" maxLength={24} value={values.contact} onChange={(event) => field("contact", event.target.value)} aria-invalid={Boolean(errors.contact)} aria-describedby={errors.contact ? "contact-error" : undefined} placeholder="e.g. +94 77 123 4567"/>{errors.contact && <small id="contact-error">{errors.contact}</small>}</label>
            <label className="new-field"><span>Customer email</span><input type="email" autoComplete="email" maxLength={254} value={values.customer_email} onChange={(event) => field("customer_email", event.target.value)} aria-invalid={Boolean(errors.customer_email)} aria-describedby={errors.customer_email ? "customer-email-error" : undefined} placeholder="customer@example.com"/>{errors.customer_email && <small id="customer-email-error">{errors.customer_email}</small>}</label>
            <label className="new-field"><span>Inquiry subject <b>*</b></span><input minLength={3} maxLength={160} value={values.subject} onChange={(event) => field("subject", event.target.value)} aria-invalid={Boolean(errors.subject)} aria-describedby={errors.subject ? "subject-error" : undefined} placeholder="Briefly describe the request"/>{errors.subject && <small id="subject-error">{errors.subject}</small>}</label>
            <label className="new-field"><span>Inquiry category <b>*</b></span><select value={values.category} onChange={(event) => field("category", event.target.value)} aria-invalid={Boolean(errors.category)} aria-describedby={errors.category ? "category-error" : undefined}><option value="">Select a category</option>{categories.map((item) => <option key={item.name} value={item.name}>{readableLabel(item.name)}</option>)}</select>{errors.category && <small id="category-error">{errors.category}</small>}</label>
            <label className="new-field new-description"><span>Description <b>*</b></span><textarea rows={5} minLength={10} maxLength={5000} value={values.description} onChange={(event) => field("description", event.target.value)} aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? "description-error" : undefined} placeholder="Add relevant details to help the team understand the customer’s inquiry."/><span className="new-char-count">{values.description.length}/5,000</span>{errors.description && <small id="description-error">{errors.description}</small>}</label>
            <div className="new-field new-description"><span>Attachments</span><label className={`evidence-dropzone${isDraggingFiles ? " is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDraggingFiles(true); }} onDragLeave={() => setIsDraggingFiles(false)} onDrop={(event) => { event.preventDefault(); setIsDraggingFiles(false); selectEvidence(Array.from(event.dataTransfer.files)); }}><input className="evidence-file-input" type="file" multiple accept="image/jpeg,image/png,image/webp,.pdf,.txt,.doc,.docx" onChange={(event) => selectEvidence(Array.from(event.target.files ?? []))} /><CloudUpload size={29} strokeWidth={2.1}/><strong>Upload pictures or documents</strong><small>JPG, PNG, WEBP, PDF, TXT, DOC, DOCX · Up to 3 pictures and 3 documents · 5 MB per file</small>{evidence.length > 0 && <span className="evidence-selected-files">{evidence.map((file) => file.name).join(" · ")}</span>}</label></div>
            <div className="new-form-actions"><Link className="new-cancel" href="/dashboard/intake">Cancel</Link><button className="intake-create" type="submit" disabled={saving}>{saving && <span className="new-spinner"/>}{saving ? "Submitting…" : "Submit inquiry"}</button></div>
          </form>}
        </section>
      </div>
    </main>
  </div>;
}
