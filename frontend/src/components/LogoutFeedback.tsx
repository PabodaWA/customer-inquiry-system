"use client";

export default function LogoutFeedback({ error, onRetry }: { error: string; onRetry: () => void }) {
  if (!error) return null;
  return <div role="alert" style={{ position: "fixed", zIndex: 1000, top: 16, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 12, maxWidth: "calc(100vw - 32px)", padding: "12px 16px", border: "1px solid #fecaca", borderRadius: 8, background: "#fff7f7", color: "#991b1b", boxShadow: "0 8px 24px #0f172a22" }}>{error}<button type="button" onClick={onRetry} style={{ color: "inherit", fontWeight: 700, textDecoration: "underline" }}>Retry sign out</button></div>;
}
