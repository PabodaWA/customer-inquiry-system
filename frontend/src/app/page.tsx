"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "../components/ThemeToggle";

type LoginResponse = {
  success?: boolean;
  message?: string;
  user?: {
    role?: "ADMIN" | "INTAKE" | "HANDLER";
  };
};

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPasswordHelp, setShowPasswordHelp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
      const response = await fetch(`${apiUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const result = (await response.json()) as LoginResponse;

      if (!response.ok || !result.success) {
        setError(result.message ?? "We couldn’t sign you in. Check your details and try again.");
        return;
      }

      const role = result.user?.role;
      if (role === "ADMIN") {
        router.push("/dashboard/admin");
      } else if (role === "INTAKE") {
        router.push("/dashboard/intake");
      } else if (role === "HANDLER") {
        router.push("/dashboard/handler");
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("We couldn’t reach the sign-in service. Please try again shortly.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <ThemeToggle className="login-theme-toggle" />
      <section className="login-card" aria-labelledby="login-title">
        <p className="login-eyebrow">CUSTOMER INQUIRY SYSTEM</p>
        <h1 id="login-title">Welcome back</h1>
        <p className="login-intro">Sign in to continue to your dashboard.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <button
            className="login-password-help-trigger"
            type="button"
            onClick={() => setShowPasswordHelp((visible) => !visible)}
            aria-expanded={showPasswordHelp}
          >
            Forgot password?
          </button>
          {showPasswordHelp && (
            <p className="login-password-help" role="status">
              Please contact your company administrator for help resetting your password.
            </p>
          )}

          {error && <p className="login-error" role="alert">{error}</p>}

          <button className="login-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="login-footer">Secure access to your workspace</p>
      </section>
    </main>
  );
}
