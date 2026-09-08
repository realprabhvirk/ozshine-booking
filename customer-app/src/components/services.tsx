import type { Service } from "@/lib/supabase/types";

// Which service card gets the "Most Popular" badge — matches the seed data
// in supabase/schema.sql. Falls back gracefully if that ever changes.
const FEATURED_SERVICE_NAME = "Platinum Wash";

export function Services({ services }: { services: Service[] }) {
  return (
    <section id="services" className="bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto mb-14 max-w-xl text-center">
          <p className="mb-2 text-sm font-bold uppercase tracking-widest text-brand">
            Our Services
          </p>
          <h2 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            Pick your wash
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {services.map((service) => {
            const featured = service.name === FEATURED_SERVICE_NAME;
            return (
              <div
                key={service.id}
                className={`relative flex flex-col rounded-3xl border p-8 ${
                  featured
                    ? "border-ink bg-ink text-white shadow-xl shadow-ink/20"
                    : "border-black/10 bg-white text-ink shadow-sm"
                }`}
              >
                {featured && (
                  <span className="absolute -top-3 left-8 rounded-full bg-brand px-4 py-1 text-xs font-bold uppercase tracking-wide text-white">
                    Most Popular
                  </span>
                )}
                <h3 className="text-xl font-bold">{service.name}</h3>
                <p
                  className={`mt-3 text-3xl font-extrabold ${
                    featured ? "text-white" : "text-ink"
                  }`}
                >
                  ${service.price_from}
                  <span
                    className={`text-base font-semibold ${
                      featured ? "text-white/60" : "text-muted"
                    }`}
                  >
                    {" "}
                    +
                  </span>
                </p>
                <p
                  className={`mt-4 flex-1 text-sm ${
                    featured ? "text-white/70" : "text-muted"
                  }`}
                >
                  {service.description}
                </p>
                <a
                  href="#booking"
                  className={`mt-8 rounded-full px-5 py-3 text-center text-sm font-bold transition ${
                    featured
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
      </div>
    </section>
  );
}
