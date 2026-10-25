import { PageShell } from "@/components/layout/PageShell";
import { ServiceCircle } from "@/components/home/ServiceCircle";
import { ServiceIcon } from "@/components/home/ServiceIcons";
import { servicesByCategory } from "@/lib/home/serviceCatalogue";

export const metadata = { title: "All services" };

/**
 * Everything the product does, by category.
 *
 * Home's card shows six; this is where the rest live, and it is the
 * destination behind both "See all" and the "More" circle. A service under
 * maintenance appears here too, tagged "Soon" — leaving it out would teach
 * someone the product does not do the thing at all.
 */
export default function ServicesPage() {
  const groups = servicesByCategory();

  return (
    <PageShell title="All services" back={{ href: "/home", label: "Home" }} width="wide">
      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.category}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {group.category}
            </h2>
            <ul className="grid grid-cols-4 gap-1 rounded-xl border border-border bg-card p-3 sm:grid-cols-6">
              {group.services.map((service) => (
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
        ))}
      </div>
    </PageShell>
  );
}
