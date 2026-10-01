import type { Metadata } from "next";
import { SiteHeader } from "@/components/site/header";
import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: false } };

// Also shown for a booking or receipt link that's wrong or no longer exists.
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="min-h-[70dvh] bg-canvas">
        <div className="mx-auto max-w-xl px-4 py-16 text-center">
          <h1 className="text-2xl font-bold tracking-tight">We couldn&apos;t find that page</h1>
          <p className="mt-3 text-fg-muted">
            If you followed a link to a booking or receipt, it may be mistyped or no longer active. Check the latest text or email from us, or make a new booking.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <LinkButton href="/book" variant="primary">
              Book a wash
            </LinkButton>
            <LinkButton href="/">Home</LinkButton>
          </div>
        </div>
      </main>
    </>
  );
}
