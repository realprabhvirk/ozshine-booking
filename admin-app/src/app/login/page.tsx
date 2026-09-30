"use client";

import Image from "next/image";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";
import logo from "@/assets/oz-shine-logo.png";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/feedback";

const NOT_STAFF = "That account isn't set up as staff for this location.";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(searchParams.get("error") === "not-staff" ? NOT_STAFF : null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError || !data.user) {
      setError("Incorrect email or password.");
      setLoading(false);
      return;
    }

    // Staff-only app: a login without an active staff row is turned away.
    const { data: staff } = await supabase.from("staff").select("id, active").eq("auth_user_id", data.user.id).maybeSingle();
    if (!staff || staff.active === false) {
      await supabase.auth.signOut();
      setError(NOT_STAFF);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-3xl bg-panel p-8 shadow-pop ring-1 ring-line">
      <Image src={logo} alt="OzShine" priority className="mb-2 h-11 w-auto" />
      <p className="mb-8 text-[15px] text-fg-muted">Beenleigh · staff sign in</p>

      {error && (
        <Notice tone="bad" className="mb-5">
          {error}
        </Notice>
      )}

      <div className="space-y-4">
        <Field label="Email">
          <Input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <Input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      </div>

      <Button type="submit" variant="primary" size="lg" block loading={loading} icon={LogIn} className="mt-7">
        Sign in
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-canvas px-4 text-fg">
      <div className="pointer-events-none absolute -top-1/3 right-[-15%] h-[120%] w-[60%] rounded-full bg-accent/15 blur-[120px]" aria-hidden />
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
