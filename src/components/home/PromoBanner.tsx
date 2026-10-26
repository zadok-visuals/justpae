import Link from "next/link";
import { ChevronRightIcon, SendIcon, WithdrawIcon } from "@/components/layout/NavIcons";
import { TileArt } from "@/components/home/TileArt";
import {
  HOME_BANNERS,
  BANNER_GROUND,
  BANNER_ICON,
  type BannerTone,
  type HomeBannerConfig,
} from "@/lib/home/homeConfig";
import { illustrationExists } from "@/lib/home/illustrations";

/**
 * GROUP 3c, then 3a — Home's promo banners. Blue pays a Chinese supplier;
 * green sells USDT for naira. Both read from HOME_BANNERS (src/lib/home/
 * homeConfig.ts) so changing a campaign is a data edit, not a JSX one.
 */
const FALLBACK_ICON: Record<BannerTone, React.ReactNode> = {
  blue: <SendIcon className="size-6" />,
  green: <WithdrawIcon className="size-6" />,
};

function Banner({ title, subtitle, href, illustration, alt, tone }: HomeBannerConfig) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 overflow-hidden rounded-xl ${BANNER_GROUND[tone]} py-3 pl-4 pr-3 transition-opacity active:opacity-90`}
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
        fallback={FALLBACK_ICON[tone]}
        fallbackClassName={BANNER_ICON[tone]}
        className="shrink-0"
      />
    </Link>
  );
}

export function PromoBanner() {
  return (
    <div className="space-y-2">
      {HOME_BANNERS.map((banner) => (
        <Banner key={banner.href} {...banner} />
      ))}
    </div>
  );
}
