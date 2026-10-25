import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as fontkit from "fontkit";

/**
 * The receipt draws with Clash Grotesk, read off disk at cold start by
 * src/app/api/receipts/[source]/[id]/route.tsx.
 *
 * This file used to guard naira/cedi/tether symbol coverage, which is why
 * DejaVu Sans was bundled at all. Amounts are ISO codes now, so what has to
 * hold is narrower and checked against the real committed bytes rather than
 * assumed: the three weights the route registers exist, parse as single TTFs,
 * and carry the Latin letters, digits and punctuation a receipt actually
 * prints — including the "−" minus sign and the "…" ellipsis that
 * truncateMiddle() inserts, neither of which is plain ASCII.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = join(__dirname, "../../app/fonts/clash-grotesk");

const WEIGHTS = [
  "ClashGrotesk-Regular.ttf",
  "ClashGrotesk-Semibold.ttf",
  "ClashGrotesk-Bold.ttf",
];

const REQUIRED_GLYPHS: Record<string, number> = {
  "digit zero": 0x0030,
  "digit nine": 0x0039,
  "capital N (as in NGN)": 0x004e,
  "lowercase a": 0x0061,
  "comma, the thousands separator": 0x002c,
  "full stop, the decimal point": 0x002e,
  "plus sign": 0x002b,
  "minus sign −": 0x2212,
  "ellipsis …, inserted by truncateMiddle": 0x2026,
};

for (const file of WEIGHTS) {
  test(`${file} carries every glyph a receipt draws`, () => {
    const opened = fontkit.openSync(join(FONTS_DIR, file));
    // A single font, never a .ttc/.dfont collection — asserted rather than
    // assumed, since that is also what tells TypeScript which of openSync()'s
    // two return types it got.
    assert.ok(!("fonts" in opened), `${file} opened as a font collection, not a single font`);
    for (const [name, codePoint] of Object.entries(REQUIRED_GLYPHS)) {
      assert.ok(
        opened.hasGlyphForCodePoint(codePoint),
        `${file} is missing a glyph for ${name} (U+${codePoint.toString(16).toUpperCase()})`,
      );
    }
  });
}

test("the bundled receipt fonts are the real thing, not empty or truncated", () => {
  for (const file of WEIGHTS) {
    const bytes = readFileSync(join(FONTS_DIR, file));
    // A corrupted commit or an LFS pointer would be a few hundred bytes, not
    // the tens of kilobytes a real TTF of this family is.
    assert.ok(bytes.length > 20_000, `${file} is only ${bytes.length} bytes — looks truncated`);
  }
});
