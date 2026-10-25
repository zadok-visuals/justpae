import Link from "next/link";
import { ChevronRightIcon, SendIcon } from "@/components/layout/NavIcons";
import { TileArt } from "@/components/home/TileArt";
import { HOME_BANNER } from "@/lib/home/homeConfig";
import { illustrationExists } from "@/lib/home/illustrations";

/**
 * GROUP 3c — the one promotional surface on Home.
 *
 * Its copy, destination and artwork live in HOME_BANNER (src/lib/home/
 * homeConfig.ts) so changing the campaign is a data edit, not a JSX one.
 * Primary soft in both themes — the dark palette already defines that token
 * as the same blue at about 16%.
 */
export function PromoBanner() {
  const { title, subtitle, href, illustration, alt } = HOME_BANNER;

  return (
    <Link
      href={href}
      className="flex items-center gap-2 overflow-hidden rounded-xl bg-primary-soft py-3 pl-4 pr-3 transition-opacity active:opacity-90"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-semibold leading-tight text-foreground">
          {title}
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{subtitle}</span>
      </span>

      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />

      <TileArt
        src={illustration}
        alt={alt}
        size={120}
        exists={illustrationExists(illustration)}
        eager
        fallback={<SendIcon className="size-6" />}
        fallbackClassName="bg-icon-blue-soft text-icon-blue"
        className="shrink-0"
      />
    </Link>
  );
}
