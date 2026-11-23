"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardRedirect() {
  const router = useRouter();

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

    async function redirectToDashboard() {
      try {
        const response = await fetch(`${apiUrl}/api/auth/me`, {
          credentials: "include",
        });
        const result = (await response.json()) as {
          user?: { role?: "ADMIN" | "INTAKE" | "HANDLER" };
        };

        if (!response.ok || !result.user?.role) {
          router.replace("/");
          return;
        }

        const paths = {
          ADMIN: "/dashboard/admin",
          INTAKE: "/dashboard/intake",
          HANDLER: "/dashboard/handler",
        };
        router.replace(paths[result.user.role]);
      } catch {
        router.replace("/");
      }
    }

    void redirectToDashboard();
  }, [router]);

  return <main className="dashboard-loading-screen">Opening dashboard...</main>;
}
