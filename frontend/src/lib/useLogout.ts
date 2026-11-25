"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { logoutSession } from "./logout";

export function useLogout() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const logout = useCallback(async () => {
    setError("");
    setPending(true);
    try {
      await logoutSession();
      router.replace("/");
    } catch {
      setError("Could not reach the sign-out service. Please try again.");
    } finally {
      setPending(false);
    }
  }, [router]);

  return { logout, error, pending };
}
