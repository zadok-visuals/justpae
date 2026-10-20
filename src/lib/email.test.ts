import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sendEmail,
  sendAnnouncementEmails,
  sendPinLockedEmail,
  sendKycRejectedEmail,
  sendRecipientChangedEmail,
  escapeHtml,
  appUrl,
} from "./email.ts";

/**
 * GROUP 5. Every real call to Resend goes through fetch(), so these tests
 * replace global.fetch rather than reaching the network — the same thing the
 * module's own "NO SDK" note says it is built to make easy. Each test
 * restores the original fetch and env afterwards so one test's mock can
 * never leak into the next.
 */

type Call = { url: string; body: unknown };

function mockFetch(handler: (url: string, body: unknown) => { ok: boolean; status?: number; text?: string }) {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url: String(url), body });
    const result = handler(String(url), body);
    return {
      ok: result.ok,
      status: result.status ?? (result.ok ? 200 : 500),
      text: async () => result.text ?? "",
    } as Response;
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function withResendKey<T>(fn: () => T): T {
  const prev = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_test_key";
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prev;
  }
}

test("sendEmail without RESEND_API_KEY skips the send and returns false", async () => {
  const prev = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  const { calls, restore } = mockFetch(() => ({ ok: true }));
  try {
    const ok = await sendEmail({ to: "a@b.com", subject: "s", preheader: "p", heading: "h", bodyParagraphs: [] });
    assert.equal(ok, false);
    assert.equal(calls.length, 0, "must not call the network with no API key");
  } finally {
    restore();
    if (prev !== undefined) process.env.RESEND_API_KEY = prev;
  }
});

test("sendEmail with no recipients never calls fetch", async () => {
  await withResendKey(async () => {
    const { calls, restore } = mockFetch(() => ({ ok: true }));
    try {
      const ok = await sendEmail({ to: [], subject: "s", preheader: "p", heading: "h", bodyParagraphs: [] });
      assert.equal(ok, false);
      assert.equal(calls.length, 0);
    } finally {
      restore();
    }
  });
});

test("sendEmail posts html AND text, and reports success", async () => {
  await withResendKey(async () => {
    const { calls, restore } = mockFetch(() => ({ ok: true }));
    try {
      const ok = await sendEmail({
        to: "customer@justpae.com",
        subject: "Your withdrawal has been sent",
        preheader: "p",
        heading: "Sent",
        bodyParagraphs: ["<strong>₦5,000.00</strong> has been sent."],
      });
      assert.equal(ok, true);
      assert.equal(calls.length, 1);
      const body = calls[0]!.body as Record<string, unknown>;
      assert.deepEqual(body.to, ["customer@justpae.com"]);
      assert.ok(typeof body.html === "string" && (body.html as string).includes("₦5,000.00"));
      assert.ok(typeof body.text === "string", "must include a plain-text part");
      // The plain-text part must not leak HTML tags into an inbox that
      // renders it raw.
      assert.ok(!(body.text as string).includes("<strong>"));
      assert.ok((body.text as string).includes("₦5,000.00"));
    } finally {
      restore();
    }
  });
});

test("sendEmail returns false and logs the status on a non-ok response, without throwing", async () => {
  await withResendKey(async () => {
    const { restore } = mockFetch(() => ({ ok: false, status: 422, text: "Invalid `to` field" }));
    try {
      const ok = await sendEmail({ to: "a@b.com", subject: "s", preheader: "p", heading: "h", bodyParagraphs: [] });
      assert.equal(ok, false);
    } finally {
      restore();
    }
  });
});

test("sendEmail returns false rather than throwing when fetch itself rejects", async () => {
  await withResendKey(async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    try {
      const ok = await sendEmail({ to: "a@b.com", subject: "s", preheader: "p", heading: "h", bodyParagraphs: [] });
      assert.equal(ok, false);
    } finally {
      globalThis.fetch = original;
    }
  });
});

test("escapeHtml neutralises every character that could break out of the markup", () => {
  assert.equal(
    escapeHtml(`<script>& "quote" 'apos'</script>`),
    "&lt;script&gt;&amp; &quot;quote&quot; &#39;apos&#39;&lt;/script&gt;",
  );
});

test("sendPinLockedEmail sends to the right address with the minutes in the copy", async () => {
  await withResendKey(async () => {
    const { calls, restore } = mockFetch(() => ({ ok: true }));
    try {
      const ok = await sendPinLockedEmail({ to: "user@justpae.com", minutes: 30 });
      assert.equal(ok, true);
      const body = calls[0]!.body as Record<string, unknown>;
      assert.deepEqual(body.to, ["user@justpae.com"]);
      assert.ok((body.html as string).includes("30 minutes"));
      assert.ok((body.text as string).includes("30 minutes"));
    } finally {
      restore();
    }
  });
});

test("sendKycRejectedEmail escapes the admin-written rejection reason", async () => {
  await withResendKey(async () => {
    const { calls, restore } = mockFetch(() => ({ ok: true }));
    try {
      await sendKycRejectedEmail({ to: "user@justpae.com", reason: `Blurry <photo> & "unreadable"` });
      const body = calls[0]!.body as Record<string, unknown>;
      assert.ok((body.html as string).includes("Blurry &lt;photo&gt; &amp; &quot;unreadable&quot;"));
      assert.ok(!(body.html as string).includes("<photo>"), "a raw admin-supplied tag must never land unescaped");
    } finally {
      restore();
    }
  });
});

test("sendRecipientChangedEmail masks nothing itself but carries both destinations through", async () => {
  await withResendKey(async () => {
    const { calls, restore } = mockFetch(() => ({ ok: true }));
    try {
      await sendRecipientChangedEmail({
        to: "user@justpae.com",
        currency: "NGN",
        previousDestination: "GTBank ••1234",
        newDestination: "Zenith ••5678",
        holdHours: 24,
      });
      const body = calls[0]!.body as Record<string, unknown>;
      assert.ok((body.html as string).includes("GTBank ••1234"));
      assert.ok((body.html as string).includes("Zenith ••5678"));
      assert.ok((body.html as string).includes("24 hours"));
    } finally {
      restore();
    }
  });
});

test("sendAnnouncementEmails batches recipients in groups of 100", async () => {
  await withResendKey(async () => {
    const recipients = Array.from({ length: 101 }, (_, i) => `user${i}@justpae.com`);
    const { calls, restore } = mockFetch((url) => {
      assert.ok(url.endsWith("/batch"), "must hit the batch endpoint, not the single-send one");
      return { ok: true };
    });
    try {
      const { sent, failed } = await sendAnnouncementEmails({
        recipients,
        subject: "New feature",
        preheader: "p",
        heading: "New feature",
        bodyParagraphs: ["We shipped something."],
      });
      assert.equal(sent, 101);
      assert.equal(failed, 0);
      assert.equal(calls.length, 2, "101 recipients is two batches: 100 then 1");
      assert.equal((calls[0]!.body as unknown[]).length, 100);
      assert.equal((calls[1]!.body as unknown[]).length, 1);
    } finally {
      restore();
    }
  });
});

test("sendAnnouncementEmails de-duplicates recipients", async () => {
  await withResendKey(async () => {
    const { calls, restore } = mockFetch(() => ({ ok: true }));
    try {
      await sendAnnouncementEmails({
        recipients: ["a@b.com", "a@b.com", "c@d.com"],
        subject: "s",
        preheader: "p",
        heading: "h",
        bodyParagraphs: ["body"],
      });
      assert.equal((calls[0]!.body as unknown[]).length, 2);
    } finally {
      restore();
    }
  });
});

test("sendAnnouncementEmails counts a failed batch as failed without throwing", async () => {
  await withResendKey(async () => {
    const { restore } = mockFetch(() => ({ ok: false, status: 500, text: "provider down" }));
    try {
      const { sent, failed } = await sendAnnouncementEmails({
        recipients: ["a@b.com", "c@d.com"],
        subject: "s",
        preheader: "p",
        heading: "h",
        bodyParagraphs: ["body"],
      });
      assert.equal(sent, 0);
      assert.equal(failed, 2);
    } finally {
      restore();
    }
  });
});

test("sendAnnouncementEmails with no RESEND_API_KEY reports everyone as failed, with no network call", async () => {
  const prev = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  const { calls, restore } = mockFetch(() => ({ ok: true }));
  try {
    const { sent, failed } = await sendAnnouncementEmails({
      recipients: ["a@b.com", "c@d.com"],
      subject: "s",
      preheader: "p",
      heading: "h",
      bodyParagraphs: ["body"],
    });
    assert.equal(sent, 0);
    assert.equal(failed, 2);
    assert.equal(calls.length, 0);
  } finally {
    restore();
    if (prev !== undefined) process.env.RESEND_API_KEY = prev;
  }
});

test("sendAnnouncementEmails with an empty list is a no-op", async () => {
  await withResendKey(async () => {
    const { calls, restore } = mockFetch(() => ({ ok: true }));
    try {
      const { sent, failed } = await sendAnnouncementEmails({
        recipients: [],
        subject: "s",
        preheader: "p",
        heading: "h",
        bodyParagraphs: ["body"],
      });
      assert.equal(sent, 0);
      assert.equal(failed, 0);
      assert.equal(calls.length, 0);
    } finally {
      restore();
    }
  });
});

test("appUrl has no trailing slash, whatever APP_URL is set to", () => {
  const prev = process.env.APP_URL;
  process.env.APP_URL = "https://justpae.com/";
  try {
    assert.equal(appUrl(), "https://justpae.com");
  } finally {
    if (prev === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = prev;
  }
});
