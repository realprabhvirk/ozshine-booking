"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "not-staff"
      ? "That account isn't set up as staff for this location."
      : null
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !data.user) {
      setError("Incorrect email or password.");
      setLoading(false);
      return;
    }

    // Reject anyone who authenticates but has no staff row — this is a
    // staff-only app, not a customer login.
    const { data: staff } = await supabase
      .from("staff")
      .select("id")
      .eq("auth_user_id", data.user.id)
      .single();

    if (!staff) {
      await supabase.auth.signOut();
      setError("That account isn't set up as staff for this location.");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm rounded-2xl bg-surface p-8 shadow-xl shadow-black/5"
    >
      <p className="mb-1 text-2xl font-bold tracking-tight">
        Oz<span className="text-brand">Shine</span>
      </p>
      <p className="mb-8 text-sm text-muted">Beenleigh staff sign in</p>

      {error && (
        <p className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-brand-dark">
          {error}
        </p>
      )}

      <label className="mb-4 block">
        <span className="mb-1.5 block text-sm font-medium text-foreground">
          Email
        </span>
        <input
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-border bg-white px-4 py-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </label>

      <label className="mb-6 block">
        <span className="mb-1.5 block text-sm font-medium text-foreground">
          Password
        </span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-border bg-white px-4 py-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-brand px-4 py-3.5 text-base font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
