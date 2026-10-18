/**
 * Turning a flat list of support messages into the thing a chat renders.
 *
 * No imports, so the grouping and the delivery-status logic are testable
 * without a browser or a database.
 */

export interface ThreadMessage {
  id: string;
  sender: "user" | "admin";
  body: string | null;
  attachment_ref: string | null;
  read_at: string | null;
  created_at: string;
}

export type ThreadItem<T extends ThreadMessage> =
  | { kind: "separator"; key: string; label: string }
  | { kind: "message"; key: string; message: T; status: DeliveryStatus | null };

/**
 * Null for a message from the other side — "Seen" under something THEY sent
 * is meaningless to the reader, and showing it would leak when the operator
 * read it in a way the operator did not choose to share.
 */
export type DeliveryStatus = "sent" | "seen";

/** Local midnight for the day an instant falls on. */
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const DAY_MS = 86_400_000;

/**
 * "Today", "Yesterday", or a date.
 *
 * Relative labels only for the two days a reader can place without doing
 * arithmetic. "3 days ago" is not more helpful than the date it stands for,
 * and it stops being true while the page is open.
 */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffDays = Math.round((startOfDay(now) - startOfDay(then)) / DAY_MS);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  return then.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    // The year only when it is not this one. "14 Mar" reads better than
    // "14 Mar 2026" for a thread from last week, and a thread from two years
    // ago genuinely needs the year.
    ...(then.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/**
 * The thread, with a day separator before the first message of each day and
 * a delivery status on the viewer's own messages.
 *
 * ONLY THE LAST OF A RUN carries a status. A column of "Sent / Sent / Sent /
 * Seen" down the side of five consecutive messages is noise: the reader
 * wants to know where the other side has got up to, which is one fact about
 * the thread, not one per bubble. The status shown is that of the newest
 * message the viewer sent — "Seen" if it has been read, "Sent" if not.
 *
 * `viewerSender` is which side is looking. The same thread renders from both
 * ends: the customer sees status on their own messages, the operator on
 * theirs.
 */
export function buildThread<T extends ThreadMessage>(
  messages: T[],
  viewerSender: "user" | "admin",
  now: Date = new Date(),
): ThreadItem<T>[] {
  const items: ThreadItem<T>[] = [];
  let lastDay: number | null = null;

  // The index of the viewer's own last message — the only one that gets a
  // status.
  let lastOwnIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].sender === viewerSender) {
      lastOwnIndex = i;
      break;
    }
  }

  messages.forEach((message, index) => {
    const day = startOfDay(new Date(message.created_at));
    if (day !== lastDay) {
      items.push({
        kind: "separator",
        // The day, not the index: a separator's identity is the date it
        // marks, so React keeps it across a poll that prepends history.
        key: `sep-${day}`,
        label: dayLabel(message.created_at, now),
      });
      lastDay = day;
    }

    items.push({
      kind: "message",
      key: message.id,
      message,
      status: index === lastOwnIndex ? (message.read_at ? "seen" : "sent") : null,
    });
  });

  return items;
}
