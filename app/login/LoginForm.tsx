"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { TextField } from "@/components/TextField";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (res.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => null);
    setError(data?.error?.message ?? "Sign in failed");
  }

  return (
    <form onSubmit={onSubmit}>
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && <p className="error-text" role="alert">{error}</p>}
      <ActionButton
        type="submit"
        disabledReason={!email || !password ? "Enter your email and password" : undefined}
        loading={busy}
      >
        Sign in
      </ActionButton>
    </form>
  );
}
