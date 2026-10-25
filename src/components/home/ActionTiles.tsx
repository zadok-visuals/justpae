import Link from "next/link";
import { TileArt } from "@/components/home/TileArt";
import { ServiceIcon } from "@/components/home/ServiceIcons";
import { HOME_TILES, TILE_ARROW, TILE_GROUND, TILE_ICON } from "@/lib/home/homeConfig";
import { illustrationExists } from "@/lib/home/illustrations";

/**
 * GROUP 3d — the four things this product is for, as a 2x2 grid.
 *
 * It replaces the row of four small circles. A circle plus an 11px label is
 * an icon in a toolbar; these are the four journeys the whole app exists to
 * start, and each one now says what it does rather than relying on the user
 * recognising an arrow.
 *
 * THE WHOLE TILE IS THE LINK, so the target is 168px tall rather than the
 * 32px arrow in its corner — the arrow is a signpost, not a button.
 *
 * The illustration degrades to an icon when the file is absent (see TileArt),
 * which is what lets the artwork ship separately from the layout.
 */
export function ActionTiles() {
  return (
    <nav aria-label="Money actions">
      <ul className="grid grid-cols-2 gap-3">
        {HOME_TILES.map((tile) => (
          <li key={tile.key}>
            <Link
              href={tile.href}
              className={`flex h-[168px] flex-col rounded-xl p-3 transition-opacity active:opacity-90 ${TILE_GROUND[tile.tone]}`}
            >
              <span className="flex flex-1 items-center justify-center">
                <TileArt
                  src={tile.illustration}
                  alt=""
                  size={88}
                  exists={illustrationExists(tile.illustration)}
                  eager={tile.eager}
                  fallback={<ServiceIcon serviceKey={tile.key} className="size-6" />}
                  fallbackClassName={TILE_ICON[tile.tone]}
                />
              </span>

              <span className="flex items-end justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-[0.9375rem] font-semibold leading-tight text-foreground">
                    {tile.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                    {tile.subtitle}
                  </span>
                </span>

                <span
                  aria-hidden="true"
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full text-white ${TILE_ARROW[tile.tone]}`}
                >
                  <ArrowUpRightIcon />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ArrowUpRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" className="size-4">
      <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
