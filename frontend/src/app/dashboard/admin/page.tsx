import AdminDashboardClient from "./AdminDashboardClient";

// Dashboard statistics are fetched from the authenticated API after mount,
// so this route cannot be rendered during instant-navigation validation.
export const instant = false;

export default function AdminDashboardPage() {
  return <AdminDashboardClient />;
}
