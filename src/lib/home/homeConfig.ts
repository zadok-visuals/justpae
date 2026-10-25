/**
 * Home's editable content, in one object.
 *
 * The promo banner and the four action tiles are the two things on Home that
 * change for business reasons rather than product ones, so they live here as
 * data rather than as JSX scattered through three components. Changing the
 * banner's destination, copy or artwork is an edit to this file and nothing
 * else.
 */

export type TileTone = "green" | "violet" | "coral" | "sky";

export interface HomeBannerConfig {
  title: string;
  subtitle: string;
  href: string;
  /** File under public/illustrations. A missing file falls back — see TileArt. */
  illustration: string;
  /** Read by screen readers in place of the artwork. */
  alt: string;
}

export const HOME_BANNER: HomeBannerConfig = {
  title: "Pay suppliers in China",
  subtitle: "Fast payments to Chinese bank accounts and Alipay",
  href: "/pay-to-china",
  illustration: "banner.png",
  alt: "",
};

export interface HomeTileConfig {
  key: string;
  title: string;
  subtitle: string;
  href: string;
  tone: TileTone;
  illustration: string;
  /** The first row is above the fold on every phone, so it loads eagerly. */
  eager: boolean;
}

export const HOME_TILES: HomeTileConfig[] = [
  {
    key: "deposit",
    title: "Deposit",
    subtitle: "Add money to your wallet",
    href: "/deposit",
    tone: "green",
    illustration: "deposit.png",
    eager: true,
  },
  {
    key: "convert",
    title: "Convert",
    subtitle: "Swap between your wallets",
    href: "/convert",
    tone: "violet",
    illustration: "convert.png",
    eager: true,
  },
  {
    key: "pay_to_china",
    title: "Pay to China",
    subtitle: "Pay any Chinese account",
    href: "/pay-to-china",
    tone: "coral",
    illustration: "pay-to-china.png",
    eager: false,
  },
  {
    key: "withdraw",
    title: "Withdraw",
    subtitle: "Send to your bank",
    href: "/withdraw",
    tone: "sky",
    illustration: "withdraw.png",
    eager: false,
  },
];

/**
 * The soft ground each tile sits on. Theme-aware: the dark palette already
 * defines these as the same hues at about 16%, so one class covers both.
 */
export const TILE_GROUND: Record<TileTone, string> = {
  green: "bg-icon-green-soft",
  violet: "bg-icon-violet-soft",
  coral: "bg-icon-coral-soft",
  sky: "bg-icon-sky-soft",
};

/**
 * The 32px arrow circle. Fixed in BOTH themes — the brief names these four
 * hexes outright, and its dark-mode note covers the tint and the title, not
 * the circle. See --color-arrow-* in globals.css.
 */
export const TILE_ARROW: Record<TileTone, string> = {
  green: "bg-arrow-green",
  violet: "bg-arrow-violet",
  coral: "bg-arrow-coral",
  sky: "bg-arrow-sky",
};

/** The fallback icon's circle, when the illustration file is not there. */
export const TILE_ICON: Record<TileTone, string> = {
  green: "bg-icon-green-soft text-icon-green",
  violet: "bg-icon-violet-soft text-icon-violet",
  coral: "bg-icon-coral-soft text-icon-coral",
  sky: "bg-icon-sky-soft text-icon-sky",
};
