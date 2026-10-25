import Link from "next/link";
import { ChevronRightIcon } from "@/components/layout/NavIcons";
import { ServiceCircle } from "@/components/home/ServiceCircle";
import { ServiceIcon } from "@/components/home/ServiceIcons";
import { homeQuickServices } from "@/lib/home/serviceCatalogue";

/**
 * One card holding the services people come back for. Six, in a fixed grid
 * rather than a rail, so nothing is reachable only by a swipe nobody knows to
 * make.
 *
 * There is no "More" circle: it and the header's "See all" both went to
 * /services, and the seventh tile is what forced a ragged 4+3 grid.
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

      {/* Six divides evenly both ways: two rows of three on a phone, one row
          of six from lg up. No orphan on a half-empty last row. */}
      <ul className="grid grid-cols-3 gap-1 lg:grid-cols-6">
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
      </ul>
    </section>
  );
}
