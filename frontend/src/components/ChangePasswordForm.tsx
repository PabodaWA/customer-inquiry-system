"use client";

import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { apiRequest } from "../lib/admin";

export default function ChangePasswordForm({ variant = "admin" }: { variant?: "admin" | "handler" }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); setError("");
    if (newPassword !== confirmPassword) { setError("New passwords do not match."); return; }
    setBusy(true);
    try {
      const result = await apiRequest<{ message?: string }>("/api/auth/password", { method: "PATCH", body: JSON.stringify({ currentPassword, newPassword }) });
      setMessage(result.message ?? "Password updated successfully.");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update password."); }
    finally { setBusy(false); }
  }

  const cardClass = variant === "handler" ? "handler-settings-card" : "management-card settings-card";
  const headingClass = variant === "handler" ? "handler-settings-card-title" : "settings-card-heading";
  return <section className={cardClass}>
    <div className={headingClass}><span className={variant === "handler" ? undefined : "settings-icon"}><KeyRound size={19}/></span><div><h3>Change password</h3><p>Verify your current password and choose a new one.</p></div></div>
    <form className="change-password-form" onSubmit={(event) => void submit(event)}>
      <label className="form-field"><span>Current password</span><input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)}/></label>
      <label className="form-field"><span>New password</span><input type="password" autoComplete="new-password" minLength={10} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)}/><small>Use at least 10 characters.</small></label>
      <label className="form-field"><span>Confirm new password</span><input type="password" autoComplete="new-password" minLength={10} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)}/></label>
      {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}
      <div className="form-actions"><button className="primary-button" type="submit" disabled={busy}>{busy ? "Updating…" : "Update password"}</button></div>
    </form>
  </section>;
}
