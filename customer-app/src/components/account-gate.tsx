"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { BookingSection } from "./booking-section";
import { LoginForm } from "./login-form";
import { AccountView } from "./account-view";
import type { Service } from "@/lib/supabase/types";

// Decides which of the three "booking area" states to show: a guest
// booking form, a login form, or the logged-in account view — based on
// whether there's a live Supabase Auth session. Swaps automatically the
// moment sign-up/sign-in/sign-out happens anywhere in the tree below.
export function AccountGate({ services }: { services: Service[] }) {
  const [supabase] = useState(() => createClient());
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // Session state is still being read from storage — render nothing rather
  // than flash the wrong view for a moment. This resolves near-instantly.
  if (session === undefined) {
    return <section id="booking" className="bg-[#f4f4f5] py-20 sm:py-28" />;
  }

  if (session) {
    return <AccountView />;
  }

  if (showLogin) {
    return <LoginForm onBack={() => setShowLogin(false)} />;
  }

  return <BookingSection services={services} onWantLogin={() => setShowLogin(true)} />;
}
