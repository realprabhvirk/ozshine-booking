import type { Service } from "@/lib/supabase/types";

// Category eyebrow + badge per service, matching the real site's ladder —
// keyed by name since services.description is prose, not a taxonomy.
// Falls back gracefully (blank category, no badge) if a name doesn't match,
// so a renamed/added service in Supabase never breaks this page.
const CATEGORY_BY_NAME: Record<string, string> = {
  "OzShine Wash": "Exterior Maintenance",
  "Platinum Wash": "Exterior Maintenance",
  "OzShine Polish": "Gloss Enhancement",
  "Interior Detail": "Cabin Restoration",
  "OzShine Full Detail": "Featured Package",
  "Correction & Coating": "Long-Term Protection",
};

const BADGE_BY_NAME: Record<string, string> = {
  "Platinum Wash": "Most Popular",
  "OzShine Full Detail": "Featured Package",
};

export function Services({ services }: { services: Service[] }) {
  return (
    <section id="services" className="bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto mb-14 max-w-xl text-center">
          <p className="mb-2 text-sm font-bold uppercase tracking-widest text-brand">
            Our Services
          </p>
          <h2 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            Detailing packages with a clear premium ladder
          </h2>
          <p className="mt-3 text-muted">
            From routine exterior upkeep to full restorative detailing —
            pick what suits your vehicle.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => {
            const badge = BADGE_BY_NAME[service.name];
            const category = CATEGORY_BY_NAME[service.name];
            const highlighted = Boolean(badge);
            return (
              <div
                key={service.id}
                className={`relative flex flex-col rounded-3xl border p-8 ${
                  highlighted
                    ? "border-ink bg-ink text-white shadow-xl shadow-ink/20"
                    : "border-black/10 bg-white text-ink shadow-sm"
                }`}
              >
                {badge && (
                  <span className="absolute -top-3 left-8 rounded-full bg-brand px-4 py-1 text-xs font-bold uppercase tracking-wide text-white">
                    {badge}
                  </span>
                )}
                {category && (
                  <p
                    className={`mb-1 text-xs font-bold uppercase tracking-widest ${
                      highlighted ? "text-white/50" : "text-brand"
                    }`}
                  >
                    {category}
                  </p>
                )}
                <h3 className="text-xl font-bold">{service.name}</h3>
                <p
                  className={`mt-3 text-3xl font-extrabold ${
                    highlighted ? "text-white" : "text-ink"
                  }`}
                >
                  ${service.price_from}
                  <span
                    className={`text-base font-semibold ${
                      highlighted ? "text-white/60" : "text-muted"
                    }`}
                  >
                    {" "}
                    +
                  </span>
                </p>
                <p
                  className={`mt-4 flex-1 text-sm ${
                    highlighted ? "text-white/70" : "text-muted"
                  }`}
                >
                  {service.description}
                </p>
                <a
                  href="#booking"
                  className={`mt-8 rounded-full px-5 py-3 text-center text-sm font-bold transition ${
                    highlighted
                      ? "bg-brand text-white hover:bg-brand-dark"
                      : "bg-ink text-white hover:bg-black"
                  }`}
                >
                  Book Now
                </a>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs text-muted">
          All prices are starting rates and may vary based on vehicle size
          and condition.
        </p>
      </div>
    </section>
  );
}
