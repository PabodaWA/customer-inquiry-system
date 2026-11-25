import AdminNotificationsClient from "./AdminNotificationsClient";

// Notifications load client-side from the authenticated API after navigation.
export const instant = false;

export default function AdminNotificationsPage() {
  return <AdminNotificationsClient />;
}
