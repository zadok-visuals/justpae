import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Two rules this codebase keeps breaking in ways nothing else catches,
 * asserted against the source itself.
 *
 * These are unusual tests — they read files rather than call functions — and
 * that is the point. Both rules are about what the source LOOKS like, and
 * both have already been broken once by a change that compiled, passed every
 * other test, and shipped.
 */

const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("the browser Supabase client reads its env literally", () => {
  /**
   * Next inlines a NEXT_PUBLIC_ variable into the browser bundle only when
   * the reference is a literal `process.env.NEXT_PUBLIC_X` it can find by
   * static analysis. A helper that does `process.env[name]` is dynamic
   * indexing, invisible to that analysis, and resolves to undefined in the
   * browser whatever the host has configured.
   *
   * This has already broken uploads once. It is invisible in review — the
   * helper call reads as more consistent than the literal — and invisible in
   * a server-rendered test, because on the server the dynamic read works
   * fine. It only fails in a real browser, at runtime, on a file upload.
   */
  const source = readFileSync(join(SRC, "lib/supabase/client.ts"), "utf8");

  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
    test(`client.ts contains the literal process.env.${name}`, () => {
      assert.ok(
        source.includes(`process.env.${name}`),
        `client.ts must reference process.env.${name} literally so Next can inline it. ` +
          `A dynamic read (process.env[name]) resolves to undefined in the browser.`,
      );
    });
  }

  test("client.ts does not import the dynamic env helper", () => {
    // requireEnv indexes process.env by a variable. Correct everywhere else;
    // wrong in the one file that runs client-side. Checked as an IMPORT
    // rather than as a call, because the file's own comment explains the
    // trap by naming requireEnv and a substring search cannot tell the
    // warning apart from the mistake it warns about.
    assert.doesNotMatch(
      source,
      /import\s*\{[^}]*\brequireEnv\b[^}]*\}\s*from/,
      "client.ts must not import requireEnv — it indexes process.env dynamically, which Next cannot inline.",
    );
  });
});

describe("no customer-facing copy says 'exchange'", () => {
  /**
   * The product converts; it does not exchange. "Exchange" invites being
   * read as a crypto exchange, which is not what this is and not what it is
   * licensed as.
   *
   * Scanned: string and template literals, and JSX text, in everything a
   * customer can read. NOT comments, NOT identifiers, and NOT the admin
   * side — internal language is free, and `exchangeCodeForSession` is
   * Supabase's own method name.
   */
  const EXEMPT = [
    // Supabase's own API surface and the OAuth concept it names.
    "exchangeCodeForSession",
    // A Busha API response field, never rendered.
    '"exchange"',
    "'exchange'",
  ];

  const customerFacing = walk(SRC).filter((f) => {
    const rel = f.slice(SRC.length + 1);
    if (rel.includes("/admin/") || rel.startsWith("admin/")) return false;
    if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) return false;
    if (rel.startsWith("app/dev/")) return false;
    return true;
  });

  test("every customer-facing file is clean", () => {
    const offenders: string[] = [];

    for (const file of customerFacing) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!/exchange/i.test(line)) return;

        // Strip the obvious comment forms before judging. A comment may say
        // whatever it likes; this rule is about what renders.
        const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "").replace(/\/\*.*?\*\//g, "");
        if (!/exchange/i.test(code)) return;
        if (EXEMPT.some((e) => code.includes(e))) return;

        offenders.push(`${file.slice(SRC.length + 1)}:${i + 1}  ${line.trim().slice(0, 100)}`);
      });
    }

    assert.deepEqual(
      offenders,
      [],
      `Customer-facing copy must say "convert"/"conversion", never "exchange":\n${offenders.join("\n")}`,
    );
  });
});

describe("no customer-facing copy names a payout provider", () => {
  /**
   * Who settles a payout is backend detail. Naming an upstream in copy a
   * customer reads is meaningless to them and a ready-made phishing pretext
   * — "this is Busha calling about your justpae withdrawal" works far better
   * when the customer has seen the name on the site.
   *
   * Identifiers and imports are fine (`BushaBank`, `@/lib/busha/limits`);
   * rendered text is not. So this looks only at string literals long enough
   * to be prose, and skips the places where prose containing a provider name
   * is correct: server logs, which only an operator reads, and the webhook
   * routes, which are named after the provider that calls them.
   */
  const files = walk(SRC).filter((f) => {
    const rel = f.slice(SRC.length + 1);
    if (rel.endsWith(".test.ts") || rel.startsWith("app/dev/") || rel.includes("/admin/")) {
      return false;
    }
    // Provider webhook and callback handlers return no UI at all.
    if (rel.startsWith("app/api/")) return false;
    // The provider API clients themselves. Everything they throw is caught
    // by toCustomerError (src/lib/provider-error.ts), which logs the real
    // error and returns one generic, provider-agnostic sentence — so a
    // `Busha request failed (502)` reaches the server log and never a
    // customer. Verified by reading every call site before exempting these:
    // the exemption is only sound while that remains true.
    if (rel.startsWith("lib/busha/") || rel.startsWith("lib/klasha/")) return false;
    return true;
  });

  test("no rendered sentence contains Busha or Klasha", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!/busha|klasha/i.test(line)) return;

        const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
        if (!/busha|klasha/i.test(code)) return;

        // A log line is written for an operator reading a server log, and
        // naming the provider there is the whole point of the prefix.
        if (/\bconsole\.(log|info|warn|error|debug)\s*\(/.test(code)) return;

        // An import path, a type name, an identifier, an enum value or an
        // object key is internal. Prose is a quoted run containing a space
        // and the provider's name.
        const prose = code.match(/["'`][^"'`]*\b(busha|klasha)\b[^"'`]*["'`]/i);
        if (!prose) return;
        if (!/\s/.test(prose[0].slice(1, -1).trim())) return;
        // Import specifiers and storage bucket paths are not prose.
        if (/from\s+["'`]/.test(code) || /import\s*\(/.test(code)) return;

        offenders.push(`${file.slice(SRC.length + 1)}:${i + 1}  ${line.trim().slice(0, 100)}`);
      });
    }

    assert.deepEqual(offenders, [], `Provider names must not appear in copy:\n${offenders.join("\n")}`);
  });
});
