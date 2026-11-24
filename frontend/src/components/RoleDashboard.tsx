"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import { logoutSession } from "../lib/logout";

type Role = "ADMIN" | "INTAKE" | "HANDLER";

type Inquiry = {
  id: number;
  customer_name: string;
  subject: string;
  category: string;
  status: "NEW" | "IN_PROGRESS" | "RESOLVED";
  created_at: string;
};

type DashboardProps = {
  role: Role;
  title: string;
};

type MeResponse = {
  success?: boolean;
  user?: {
    id: number;
    fullName: string;
    email: string;
    role: Role;
    specialization?: string | null;
  };
};

const rolePaths: Record<Role, string> = {
  ADMIN: "/dashboard/admin",
  INTAKE: "/dashboard/intake",
  HANDLER: "/dashboard/handler",
};

const inquiryPaths: Record<Role, string> = {
  ADMIN: "/dashboard/admin/inquiries",
  INTAKE: "/dashboard/intake/inquiries",
  HANDLER: "/dashboard/handler",
};

export default function RoleDashboard({ role, title }: DashboardProps) {
  const router = useRouter();
  const [userName, setUserName] = useState("Loading...");
  const [specialization, setSpecialization] = useState("");
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

    async function loadDashboard() {
      try {
        const meResponse = await fetch(`${apiUrl}/api/auth/me`, {
          credentials: "include",
        });
        const me = (await meResponse.json()) as MeResponse;

        if (!meResponse.ok || !me.user) {
          router.replace("/");
          return;
        }

        if (me.user.role !== role) {
          router.replace(rolePaths[me.user.role]);
          return;
        }

        setUserName(me.user.fullName);
        setSpecialization(me.user.specialization ?? "");

        const inquiryResponse = await fetch(`${apiUrl}/api/inquiries`, {
          credentials: "include",
        });
        const result = (await inquiryResponse.json()) as {
          success?: boolean;
          data?: Inquiry[];
        };

        if (inquiryResponse.ok && result.success) {
          setInquiries(result.data ?? []);
        }
      } catch {
        router.replace("/");
      } finally {
        setLoading(false);
      }
    }

    void loadDashboard();
  }, [role, router]);

  async function handleLogout() {
    setError("");
    try { await logoutSession(); router.replace("/"); }
    catch { setError("Could not log out because the service is unavailable. Please try again."); }
  }

  const counts = {
    total: inquiries.length,
    new: inquiries.filter((item) => item.status === "NEW").length,
    inProgress: inquiries.filter((item) => item.status === "IN_PROGRESS").length,
    resolved: inquiries.filter((item) => item.status === "RESOLVED").length,
  };

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div>
          <p className="brand-mark">CIS</p>
          <p className="brand-name">Customer Inquiry</p>
        </div>

        <nav className="dashboard-nav" aria-label="Dashboard navigation">
          <a className="active" href={rolePaths[role]}>
            <span>▦</span> Overview
          </a>
          {role === "INTAKE" && (
            <a href="/dashboard/intake/new">
              <span>＋</span> New inquiry
            </a>
          )}
          <a href={inquiryPaths[role]}>
            <span>□</span> Inquiries
          </a>
        </nav>

        <button className="logout-button" type="button" onClick={handleLogout}>
          <span>↪</span> Log out
        </button>
      </aside>

      <section className="dashboard-main">
        {error && <p className="login-error" role="alert">{error}<button type="button" onClick={() => void handleLogout()}>Retry</button></p>}
        <header className="dashboard-header">
          <div>
            <p className="dashboard-eyebrow">{role} workspace</p>
            <h1>{title}</h1>
          </div>
          <div className="dashboard-header-tools">
            <ThemeToggle className="icon-button" />
            <div className="profile-chip">
              <span className="profile-avatar">{userName.charAt(0).toUpperCase()}</span>
              <span>
                <strong>{userName}</strong>
                <small>{specialization ? `${specialization} handler` : role}</small>
              </span>
            </div>
          </div>
        </header>

        {loading ? (
          <p className="dashboard-loading">Loading dashboard...</p>
        ) : (
          <>
            <section className="stat-grid" aria-label="Inquiry summary">
              <article className="stat-card">
                <span className="stat-icon teal">□</span>
                <div><p>Total inquiries</p><strong>{counts.total}</strong></div>
              </article>
              <article className="stat-card">
                <span className="stat-icon blue">○</span>
                <div><p>New</p><strong>{counts.new}</strong></div>
              </article>
              <article className="stat-card">
                <span className="stat-icon amber">◷</span>
                <div><p>In progress</p><strong>{counts.inProgress}</strong></div>
              </article>
              <article className="stat-card">
                <span className="stat-icon green">✓</span>
                <div><p>Resolved</p><strong>{counts.resolved}</strong></div>
              </article>
            </section>

            <section className="inquiry-panel">
              <div className="panel-heading">
                <div>
                  <p className="dashboard-eyebrow">Inquiry queue</p>
                  <h2>{role === "HANDLER" ? "Assigned to you" : "Recent inquiries"}</h2>
                </div>
                {role === "INTAKE" && (
                  <a className="primary-action" href="/dashboard/intake/new">+ Create inquiry</a>
                )}
              </div>

              {inquiries.length === 0 ? (
                <div className="empty-state">
                  <span>□</span>
                  <h3>No inquiries yet</h3>
                  <p>Inquiries assigned or visible to you will appear here.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Subject</th>
                        <th>Category</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inquiries.slice(0, 8).map((inquiry) => (
                        <tr key={inquiry.id}>
                          <td><strong>{inquiry.customer_name}</strong></td>
                          <td>{inquiry.subject}</td>
                          <td>{inquiry.category}</td>
                          <td>
                            <span className={`status status-${inquiry.status.toLowerCase()}`}>
                              {inquiry.status.replace("_", " ")}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
