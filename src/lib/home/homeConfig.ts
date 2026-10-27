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

/** The promo banners' own two tints — blue for the first, green for the
 *  second. Not TileTone: a banner is full-width and only ever these two. */
export type BannerTone = "blue" | "green";

export interface HomeBannerConfig {
  title: string;
  subtitle: string;
  href: string;
  /** File under public/illustrations. A missing file falls back — see TileArt. */
  illustration: string;
  /** Read by screen readers in place of the artwork. */
  alt: string;
  tone: BannerTone;
}

/**
 * GROUP 3a — both of Home's promo banners, same config object, same style,
 * different tint. The first pays a Chinese supplier; the second turns USDT
 * into naira — opposite directions of money, so distinct tones are the
 * point rather than decoration.
 */
export const HOME_BANNERS: HomeBannerConfig[] = [
  {
    title: "Pay suppliers in China",
    subtitle: "Fast payments to Chinese bank accounts and Alipay",
    href: "/pay-to-china",
    illustration: "Pay-to-china.png",
    alt: "",
    tone: "blue",
  },
  {
    title: "Sell your USDT",
    subtitle: "Get naira in your bank at today's rate",
    href: "/sell",
    illustration: "Sell-your-USDT.png",
    alt: "",
    tone: "green",
  },
];

/** The soft ground each banner sits on. */
export const BANNER_GROUND: Record<BannerTone, string> = {
  blue: "bg-primary-soft",
  green: "bg-icon-green-soft",
};

/** The fallback icon's tint, when the illustration file is not there. */
export const BANNER_ICON: Record<BannerTone, string> = {
  blue: "bg-icon-blue-soft text-icon-blue",
  green: "bg-icon-green-soft text-icon-green",
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
    illustration: "Deposit.png",
    eager: true,
  },
  {
    key: "convert",
    title: "Convert",
    subtitle: "Swap between your wallets",
    href: "/convert",
    tone: "violet",
    illustration: "Convert.png",
    eager: true,
  },
  {
    key: "pay_to_china",
    title: "Pay to China",
    subtitle: "Pay any Chinese account",
    href: "/pay-to-china",
    tone: "coral",
    illustration: "Pay-to-China.png",
    eager: false,
  },
  {
    key: "withdraw",
    title: "Withdraw",
    subtitle: "Send to your bank",
    href: "/withdraw",
    tone: "sky",
    illustration: "Withdraw.png",
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
