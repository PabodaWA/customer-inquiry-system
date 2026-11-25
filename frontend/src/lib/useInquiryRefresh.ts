"use client";

import { useEffect, useRef } from "react";

const REFRESH_INTERVAL_MS = 5_000;

export function useInquiryRefresh(refresh: () => Promise<void>) {
  const refreshRef = useRef(refresh);
  const refreshing = useRef(false);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    function refreshIfVisible() {
      if (document.visibilityState !== "visible" || refreshing.current) return;

      refreshing.current = true;
      void refreshRef.current()
        .catch((cause: unknown) => console.error("Could not refresh inquiry data.", cause))
        .finally(() => { refreshing.current = false; });
    }

    const interval = window.setInterval(refreshIfVisible, REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, []);
}
