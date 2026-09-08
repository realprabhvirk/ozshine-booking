export function Hero() {
  return (
    <header className="relative overflow-hidden bg-ink text-white">
      {/* Dark, glossy studio-light backdrop — built in CSS rather than a
          stock photo, since there's no licensed OzShine imagery to use
          here. Radial glow + soft sheen bars stand in for the wet-shine
          car photography the real site uses. */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-1/3 right-[-10%] h-[140%] w-[70%] rounded-full bg-brand/25 blur-[120px]" />
        <div className="absolute bottom-[-30%] left-[-10%] h-[80%] w-[60%] rounded-full bg-white/5 blur-[100px]" />
        <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_35%,rgba(255,255,255,0.06)_50%,transparent_65%)]" />
      </div>

      <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <p className="text-xl font-extrabold tracking-tight">
          Oz<span className="text-brand">Shine</span>
        </p>
        <a
          href="#booking"
          className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
        >
          Book Now
        </a>
      </nav>

      <div className="relative mx-auto flex max-w-6xl flex-col items-start px-6 pb-24 pt-10 sm:pb-32 sm:pt-16">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-white/80">
          Beenleigh, QLD
        </p>
        <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
          A showroom shine,
          <br />
          <span className="text-brand">every single time.</span>
        </h1>
        <p className="mt-6 max-w-lg text-lg text-white/70 sm:text-xl">
          Beenleigh&apos;s hand car wash and detailing specialists. Book online
          in under a minute — no account, no hassle.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <a
            href="#booking"
            className="rounded-full bg-brand px-7 py-4 text-base font-bold text-white shadow-lg shadow-brand/30 transition hover:bg-brand-dark"
          >
            Book Your Wash
          </a>
          <a
            href="#services"
            className="rounded-full border border-white/20 px-7 py-4 text-base font-semibold text-white transition hover:bg-white/10"
          >
            See Prices
          </a>
        </div>
      </div>
    </header>
  );
}
