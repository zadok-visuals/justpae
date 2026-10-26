import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HOME_BANNERS,
  HOME_TILES,
  TILE_ARROW,
  TILE_GROUND,
  TILE_ICON,
  BANNER_GROUND,
  BANNER_ICON,
} from "./homeConfig.ts";

test("the four tiles are the four money journeys, in the brief's order", () => {
  assert.deepEqual(
    HOME_TILES.map((t) => t.title),
    ["Deposit", "Convert", "Pay to China", "Withdraw"],
  );
});

test("every tile has a ground, an arrow and a fallback icon for its tone", () => {
  for (const tile of HOME_TILES) {
    assert.ok(TILE_GROUND[tile.tone], `${tile.key} has no ground`);
    assert.ok(TILE_ARROW[tile.tone], `${tile.key} has no arrow colour`);
    assert.ok(TILE_ICON[tile.tone], `${tile.key} has no fallback tint`);
  }
});

test("only the first row loads eagerly — the second is below the fold", () => {
  assert.deepEqual(
    HOME_TILES.map((t) => t.eager),
    [true, true, false, false],
  );
});

test("no tone is yellow or gold, here or in either banner", () => {
  const classes = [
    ...Object.values(TILE_GROUND),
    ...Object.values(TILE_ARROW),
    ...Object.values(TILE_ICON),
    ...Object.values(BANNER_GROUND),
    ...Object.values(BANNER_ICON),
  ].join(" ");
  assert.doesNotMatch(classes, /yellow|gold|amber/i);
});

test("every tile and every banner point somewhere, with copy to read", () => {
  for (const tile of [...HOME_TILES]) {
    assert.match(tile.href, /^\//);
    assert.ok(tile.subtitle.length > 0, `${tile.key} has no subtitle`);
    assert.match(tile.illustration, /\.(png|svg|webp)$/);
  }
  for (const banner of HOME_BANNERS) {
    assert.match(banner.href, /^\//);
    assert.ok(banner.title.length > 0);
    assert.ok(banner.subtitle.length > 0);
    assert.ok(BANNER_GROUND[banner.tone], `${banner.title} has no ground`);
  }
});

test("the tile keys are unique, so the icon fallback map cannot collide", () => {
  const keys = HOME_TILES.map((t) => t.key);
  assert.equal(new Set(keys).size, keys.length);
});

/**
 * GROUP 3a — the two banners, in the order the brief asks for: China pay-out
 * first, the USDT sell second, directly below it.
 */
test("the sell banner sits directly below the pay-to-China banner", () => {
  assert.deepEqual(
    HOME_BANNERS.map((b) => b.href),
    ["/pay-to-china", "/sell"],
  );
  assert.equal(HOME_BANNERS[1]?.tone, "green");
  assert.equal(HOME_BANNERS[0]?.tone, "blue");
});
