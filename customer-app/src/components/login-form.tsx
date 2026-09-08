"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ onBack }: { onBack: () => void }) {
  const [supabase] = useState(() => createClient());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setSubmitting(false);

    if (signInError) {
      setError("Incorrect email or password.");
      return;
    }

    // No further action needed — the parent component listens for the auth
    // state change and swaps to the account view on its own.
  }

  return (
    <section id="booking" className="bg-[#f4f4f5] py-20 sm:py-28">
      <div className="mx-auto max-w-md px-6">
        <div className="mb-10 text-center">
          <p className="mb-2 text-sm font-bold uppercase tracking-widest text-brand">
            Welcome Back
          </p>
          <h2 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            Log in
          </h2>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm sm:p-10"
        >
          {error && (
            <p className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-brand-dark">
              {error}
            </p>
          )}

          <label className="mb-5 block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">
              Email
            </span>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="mb-6 block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">
              Password
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-brand px-6 py-4 text-base font-bold text-white shadow-lg shadow-brand/20 transition hover:bg-brand-dark disabled:opacity-60"
          >
            {submitting ? "Logging in…" : "Log In"}
          </button>

          <button
            type="button"
            onClick={onBack}
            className="mt-4 w-full text-center text-sm font-medium text-muted hover:text-ink"
          >
            ← Back to booking
          </button>
        </form>
      </div>
    </section>
  );
}

const inputClass =
  "w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-base text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";
