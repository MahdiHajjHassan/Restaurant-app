/**
 * Unmissable on purpose.
 *
 * The whole hazard of impersonation is forgetting you are doing it and editing
 * a client's live menu believing it is the demo. A subtle indicator would
 * defeat the point, so this is the one place in the console that shouts: a full
 * width warning band above everything, in the warn colour rather than the
 * brand's, because it is a state to leave rather than a place to be.
 *
 * A server component with a plain anchor -- no client JavaScript at all.
 * Leaving clears a cookie that grants access to this very page, so it goes
 * through a route handler that answers a redirect: see operator/leave/route.ts
 * for why a Server Action races itself here. `<a>` rather than next/link so
 * Next does not prefetch the link and quietly end an impersonation still in
 * use.
 */
export function ImpersonationBanner({
  restaurantName,
}: {
  restaurantName: string;
}) {
  return (
    <div
      role="status"
      className="-mx-5 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--c-warn)] bg-[var(--c-warn-soft)] px-5 py-2.5 text-[var(--c-warn)]"
    >
      <span className="text-[0.825rem] font-medium">
        You are working inside <strong>{restaurantName}</strong>. Changes are
        theirs.
      </span>
      <a
        href="/operator/leave"
        className="shrink-0 rounded-lg border border-[var(--c-warn)] px-3 py-1.5 text-[0.775rem] font-semibold hover:bg-[var(--c-warn)] hover:text-[var(--c-surface)]"
      >
        Leave
      </a>
    </div>
  );
}
