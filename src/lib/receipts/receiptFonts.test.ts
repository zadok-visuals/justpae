import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as fontkit from "fontkit";

/**
 * GROUP 7. The whole reason fonts/DejaVuSans*.ttf are bundled at all: next/og's
 * default font has no glyphs for ₦, ₵ or ₮, and a receipt missing one of
 * those prints an empty box exactly where the currency symbol belongs — on
 * the one artefact in this product most likely to leave it and be read by
 * someone who never opened the app. Asserted against the real bytes of the
 * files actually committed here, not against "DejaVu Sans should cover
 * this" as a claim about the typeface in the abstract — a future swap to a
 * different cut or a corrupted re-commit would still be caught.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = join(__dirname, "fonts");

// Every currency symbol a receipt can actually draw — see
// src/lib/currencies.ts's `symbol` field for each CurrencyMeta entry.
const REQUIRED_GLYPHS: Record<string, number> = {
  "naira (NGN) ₦": 0x20a6,
  "cedi (GHS) ₵": 0x20b5,
  "USDT ₮": 0x20ae,
  "yen/yuan (CNY) ¥": 0x00a5,
  "dollar (USD) $": 0x0024,
};

for (const file of ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf"]) {
  test(`${file} carries every currency glyph a receipt draws`, () => {
    const opened = fontkit.openSync(join(FONTS_DIR, file));
    // Both bundled files are plain .ttf, never a .ttc/.dfont collection —
    // asserted rather than assumed, since that's also what tells TypeScript
    // which of openSync()'s two return types it actually got.
    assert.ok(!("fonts" in opened), `${file} opened as a font collection, not a single font`);
    const font = opened;
    for (const [name, codePoint] of Object.entries(REQUIRED_GLYPHS)) {
      assert.ok(
        font.hasGlyphForCodePoint(codePoint),
        `${file} is missing a glyph for ${name} (U+${codePoint.toString(16).toUpperCase()})`,
      );
    }
  });
}

test("the bundled font files are the real thing, not empty or truncated", () => {
  for (const file of ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf"]) {
    const bytes = readFileSync(join(FONTS_DIR, file));
    // A corrupted or LFS-pointer-only commit would be a few hundred bytes,
    // not the few hundred kilobytes a real TTF with this much coverage is.
    assert.ok(bytes.length > 100_000, `${file} is only ${bytes.length} bytes — looks truncated`);
  }
});
