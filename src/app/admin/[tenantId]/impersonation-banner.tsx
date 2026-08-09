/**
 * Unmissable on purpose.
 *
 * The whole hazard of impersonation is forgetting you are doing it and editing
 * a client's live menu believing it is the demo. A subtle indicator would
 * defeat the point.
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
      className="-mx-5 flex flex-wrap items-center justify-between gap-3 bg-[var(--color-accent)] px-5 py-2 text-[var(--color-on-accent)]"
    >
      <span className="text-[0.8rem]">
        You are working inside <strong>{restaurantName}</strong>. Changes are
        theirs.
      </span>
      <a
        href="/operator/leave"
        className="rounded-md border border-[var(--color-on-accent)] px-2.5 py-1 text-[0.75rem]"
      >
        Leave
      </a>
    </div>
  );
}
