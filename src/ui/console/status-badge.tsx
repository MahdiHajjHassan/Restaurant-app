/**
 * A restaurant's status, in colour.
 *
 * This was a grey outlined pill identical to every other grey outlined pill, so
 * the most important fact about a restaurant in the list -- whether customers
 * can reach it right now -- was the one you could not see.
 *
 * The words are the database's own status values and are NOT translated here:
 * `operator.spec` asserts on them, and an operator reading the console should
 * see the same vocabulary the rest of the system uses.
 */

export type TenantStatus = "active" | "trial" | "suspended" | "pending";

/*
 * Active is deliberately NOT green.
 *
 * A working restaurant is the normal case, and in a list where most rows are
 * working, colouring them all makes the colour report nothing -- the eye stops
 * seeing it and the two rows that actually need an operator get lost among the
 * green. Colour is reserved for what needs attention: a trial that will end, a
 * site that has stopped serving. Everything healthy stays quiet.
 */
const TONES: Record<TenantStatus, string> = {
  active: "bg-[var(--c-brand-soft)] text-[var(--c-text-muted)]",
  trial: "bg-[var(--c-warn-soft)] text-[var(--c-warn)]",
  suspended: "bg-[var(--c-danger-soft)] text-[var(--c-danger)]",
  pending: "bg-[var(--c-surface-sunk)] text-[var(--c-text-muted)]",
};

/** Maps a status onto the spine a row or panel should carry. */
export function spineFor(status: string) {
  if (status === "trial") return "warn" as const;
  if (status === "suspended") return "danger" as const;
  // Active, and anything unrecognised, keeps the default silver edge.
  return "neutral" as const;
}

export function StatusBadge({ status }: { status: string }) {
  const tone = TONES[status as TenantStatus] ?? TONES.pending;

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[0.7rem] font-semibold tracking-wide uppercase ${tone}`}
    >
      {status}
    </span>
  );
}
