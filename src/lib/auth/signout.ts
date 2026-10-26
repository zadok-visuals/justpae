/** Where /auth/signout sends the browser once it has cleared the session. */
export function resolveSignoutRedirect(next: string | null): string {
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/login";
  return `${safeNext}${safeNext.includes("?") ? "&" : "?"}expired=1`;
}
