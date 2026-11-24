import { API_BASE } from "./admin";

export async function logoutSession() {
  const response = await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });

  // A missing session already means the browser is signed out.
  if (response.status === 401) return;
  if (!response.ok) throw new Error("Could not log out. Please try again.");
}
