import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildThread, dayLabel, type ThreadMessage } from "./thread.ts";

/**
 * The two things a support thread has to get right that are easy to get
 * subtly wrong: which day a message belongs to, and which message carries
 * the delivery status.
 */

// Fixed "now" so "Today" and "Yesterday" mean something stable.
const NOW = new Date(2026, 4, 20, 14, 0, 0); // 20 May 2026, local

function at(year: number, month: number, day: number, hour = 12, minute = 0): string {
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

function msg(partial: Partial<ThreadMessage> & Pick<ThreadMessage, "id" | "sender">): ThreadMessage {
  return {
    body: "hello",
    attachment_ref: null,
    read_at: null,
    created_at: at(2026, 5, 20),
    ...partial,
  };
}

describe("dayLabel", () => {
  test("today and yesterday are named, not dated", () => {
    assert.equal(dayLabel(at(2026, 5, 20, 9), NOW), "Today");
    assert.equal(dayLabel(at(2026, 5, 19, 23), NOW), "Yesterday");
  });

  test("a minute past midnight today is still Today, not Yesterday", () => {
    // The comparison is on calendar days, not on a 24-hour window. An elapsed
    // -hours implementation calls 00:01 "Yesterday" for most of the morning.
    assert.equal(dayLabel(at(2026, 5, 20, 0, 1), NOW), "Today");
  });

  test("late last night is Yesterday even though it is under 24 hours ago", () => {
    assert.equal(dayLabel(at(2026, 5, 19, 23, 59), NOW), "Yesterday");
  });

  test("anything older gets a date, because 'N days ago' is not easier to read", () => {
    assert.equal(dayLabel(at(2026, 5, 18), NOW), "18 May");
    assert.equal(dayLabel(at(2026, 3, 2), NOW), "2 Mar");
  });

  test("a different year carries the year", () => {
    assert.match(dayLabel(at(2024, 11, 5), NOW), /2024/);
  });

  test("this year does not carry the year", () => {
    assert.doesNotMatch(dayLabel(at(2026, 1, 5), NOW), /2026/);
  });
});

describe("buildThread — day separators", () => {
  test("one separator before the first message of each day", () => {
    const items = buildThread(
      [
        msg({ id: "a", sender: "user", created_at: at(2026, 5, 18, 10) }),
        msg({ id: "b", sender: "admin", created_at: at(2026, 5, 18, 11) }),
        msg({ id: "c", sender: "user", created_at: at(2026, 5, 20, 9) }),
      ],
      "user",
      NOW,
    );

    assert.deepEqual(
      items.map((i) => (i.kind === "separator" ? `[${i.label}]` : i.key)),
      ["[18 May]", "a", "b", "[Today]", "c"],
    );
  });

  test("two messages on the same day share one separator", () => {
    const items = buildThread(
      [
        msg({ id: "a", sender: "user", created_at: at(2026, 5, 20, 9) }),
        msg({ id: "b", sender: "user", created_at: at(2026, 5, 20, 17) }),
      ],
      "user",
      NOW,
    );
    assert.equal(items.filter((i) => i.kind === "separator").length, 1);
  });

  test("a separator is keyed by its day, so a poll does not remount it", () => {
    const first = buildThread([msg({ id: "a", sender: "user" })], "user", NOW);
    const second = buildThread(
      [msg({ id: "a", sender: "user" }), msg({ id: "b", sender: "admin" })],
      "user",
      NOW,
    );
    assert.equal(first[0].key, second[0].key);
  });

  test("an empty thread produces nothing at all, not a lone separator", () => {
    assert.deepEqual(buildThread([], "user", NOW), []);
  });
});

describe("buildThread — delivery status", () => {
  test("only the viewer's LAST message carries a status", () => {
    const items = buildThread(
      [
        msg({ id: "a", sender: "user", read_at: at(2026, 5, 20, 13) }),
        msg({ id: "b", sender: "user" }),
        msg({ id: "c", sender: "user" }),
      ],
      "user",
      NOW,
    );
    const statuses = items
      .filter((i) => i.kind === "message")
      .map((i) => (i.kind === "message" ? i.status : null));
    assert.deepEqual(statuses, [null, null, "sent"]);
  });

  test("read_at on the last message makes it Seen", () => {
    const items = buildThread(
      [msg({ id: "a", sender: "user", read_at: at(2026, 5, 20, 13) })],
      "user",
      NOW,
    );
    const last = items.find((i) => i.kind === "message");
    assert.equal(last?.kind === "message" && last.status, "seen");
  });

  test("the other side's messages never carry a status", () => {
    // "Seen" under a message the operator sent tells the customer nothing,
    // and from the operator's side it would disclose when they read it.
    const items = buildThread(
      [
        msg({ id: "a", sender: "user" }),
        msg({ id: "b", sender: "admin", read_at: at(2026, 5, 20, 13) }),
      ],
      "user",
      NOW,
    );
    const adminItem = items.find((i) => i.kind === "message" && i.message.id === "b");
    assert.equal(adminItem?.kind === "message" && adminItem.status, null);
  });

  test("the status sits on the viewer's last message even when the other side replied after", () => {
    const items = buildThread(
      [
        msg({ id: "a", sender: "user", read_at: at(2026, 5, 20, 12) }),
        msg({ id: "b", sender: "admin", created_at: at(2026, 5, 20, 13) }),
      ],
      "user",
      NOW,
    );
    const own = items.find((i) => i.kind === "message" && i.message.id === "a");
    assert.equal(own?.kind === "message" && own.status, "seen");
  });

  test("the same thread read from the admin side statuses the ADMIN's last message", () => {
    const messages = [
      msg({ id: "a", sender: "user" }),
      msg({ id: "b", sender: "admin", created_at: at(2026, 5, 20, 13) }),
    ];
    const items = buildThread(messages, "admin", NOW);
    const adminItem = items.find((i) => i.kind === "message" && i.message.id === "b");
    const userItem = items.find((i) => i.kind === "message" && i.message.id === "a");
    assert.equal(adminItem?.kind === "message" && adminItem.status, "sent");
    assert.equal(userItem?.kind === "message" && userItem.status, null);
  });

  test("a thread with nothing from the viewer has no status anywhere", () => {
    const items = buildThread([msg({ id: "a", sender: "admin" })], "user", NOW);
    const statuses = items
      .filter((i) => i.kind === "message")
      .map((i) => (i.kind === "message" ? i.status : null));
    assert.deepEqual(statuses, [null]);
  });
});
