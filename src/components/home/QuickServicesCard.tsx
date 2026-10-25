import Link from "next/link";
import { ChevronRightIcon } from "@/components/layout/NavIcons";
import { ServiceCircle } from "@/components/home/ServiceCircle";
import { ServiceIcon } from "@/components/home/ServiceIcons";
import { homeQuickServices } from "@/lib/home/serviceCatalogue";

/**
 * One card holding the services people come back for. Six plus "More",
 * four per row on a phone and six on a desktop — a fixed grid, never a rail,
 * so nothing is reachable only by a swipe nobody knows to make.
 */
export function QuickServicesCard() {
  const services = homeQuickServices();

  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <div className="mb-1 flex items-center justify-between gap-3 px-1">
        <h2 className="text-sm font-semibold text-foreground">Quick services</h2>
        <Link
          href="/services"
          className="-my-2 inline-flex min-h-11 items-center gap-0.5 text-sm font-medium text-primary"
        >
          See all
          <ChevronRightIcon />
        </Link>
      </div>

      <ul className="grid grid-cols-4 gap-1 sm:grid-cols-6">
        {services.map((service) => (
          <li key={service.key}>
            <ServiceCircle
              label={service.label}
              href={service.href}
              tone={service.tone}
              live={service.live}
              icon={<ServiceIcon serviceKey={service.key} />}
            />
          </li>
        ))}
        <li>
          <ServiceCircle
            label="More"
            href="/services"
            tone="blue"
            live
            icon={<ServiceIcon serviceKey="more" />}
          />
        </li>
      </ul>
    </section>
  );
}
