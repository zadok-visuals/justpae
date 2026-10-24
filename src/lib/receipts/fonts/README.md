# DejaVu Sans

`DejaVuSans.ttf` and `DejaVuSans-Bold.ttf`, bundled here for
`src/app/api/receipts/[source]/[id]/route.tsx` — see the note in that file
for why a receipt image needs its own font at all.

**Why this font, specifically:** the receipt draws currency symbols next/og's
default font doesn't carry glyphs for — ₦ (naira, U+20A6), ₵ (cedi, U+20B5)
and ₮ (used for USDT, U+20AE) all render as empty boxes without one. DejaVu
Sans was picked because its Unicode coverage is unusually broad and
specifically includes the full Currency Symbols block; `receiptFonts.test.ts`
in the parent directory asserts this mechanically against the exact files
committed here, rather than trusting that to stay true by inspection.

**License:** DejaVu fonts are derived from the Bitstream Vera fonts and
distributed under a permissive license that explicitly allows bundling,
modification and redistribution (including in a commercial product) with no
royalty — the only real constraints are keeping the copyright/license notice
with the font and not using the "DejaVu" name to imply endorsement of a
derivative. Full license text and project home:
<https://dejavu-fonts.github.io/License.html>. Source: Debian's
`fonts-dejavu-core` package (`/usr/share/fonts/truetype/dejavu/`),
unmodified.
