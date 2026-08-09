"use client";

import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  attachDomain,
  removeDomain,
  setDomainVerified,
  type OperatorActionState,
} from "../actions";

const initialState: OperatorActionState = { error: null };

const ghost =
  "rounded-md border border-[var(--color-rule)] px-2 py-1 text-[0.75rem] text-[var(--color-muted)] hover:text-[var(--color-ink)] disabled:opacity-60";

export interface DomainRow {
  id: string;
  hostname: string;
  isPrimary: boolean;
  verified: boolean;
}

export function DomainList({
  tenantId,
  domains,
}: {
  tenantId: string;
  domains: DomainRow[];
}) {
  const action = attachDomain.bind(null, tenantId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const hostRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Uncontrolled input: React clears the form once its action settles, so this
  // effect only touches what lives outside React.
  useEffect(() => {
    if (!state.saved) return;
    hostRef.current?.focus();
    router.refresh();
  }, [state, router]);

  return (
    <section className="mt-8">
      <h2 className="font-display text-base">Addresses</h2>

      {/*
        Says what is not built, rather than showing a status that implies a
        check is happening. A verification UI that is trusted and wrong is
        worse than none: it would tell the operator a client's domain is live
        when nothing has looked.
      */}
      <p className="mt-1 max-w-prose text-[0.8rem] text-[var(--color-muted)]">
        Automatic DNS checking is not built yet — there is no deployed address
        to point a domain at. Until then, confirm the domain resolves yourself,
        then mark it verified here. Unverified addresses do not serve the site.
      </p>

      <ul className="mt-3 divide-y divide-[var(--color-rule)]">
        {domains.map((domain) => (
          <li
            key={domain.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5"
          >
            <span className="min-w-0 flex-1 truncate text-[0.9rem]">
              {domain.hostname}
            </span>

            {domain.isPrimary ? (
              <span className="shrink-0 rounded-sm border border-[var(--color-rule)] px-1.5 py-0.5 text-[0.65rem] tracking-wide text-[var(--color-muted)] uppercase">
                Primary
              </span>
            ) : null}

            <span
              className={`shrink-0 text-[0.75rem] ${
                domain.verified ? "" : "text-[var(--color-muted)]"
              }`}
            >
              {domain.verified ? "Verified" : "Not verified"}
            </span>

            <button
              type="button"
              disabled={busy}
              aria-label={
                domain.verified
                  ? `Mark ${domain.hostname} unverified`
                  : `Mark ${domain.hostname} verified`
              }
              onClick={() =>
                startBusy(async () => {
                  const result = await setDomainVerified(
                    tenantId,
                    domain.id,
                    !domain.verified,
                  );
                  if (result.error) setError(result.error);
                  router.refresh();
                })
              }
              className={ghost}
            >
              {domain.verified ? "Unverify" : "Mark verified"}
            </button>

            <button
              type="button"
              disabled={busy}
              aria-label={`Remove ${domain.hostname}`}
              onClick={() =>
                startBusy(async () => {
                  const result = await removeDomain(tenantId, domain.id);
                  if (result.error) setError(result.error);
                  router.refresh();
                })
              }
              className={ghost}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="mt-2 text-[0.8rem]">
          {error}
        </p>
      ) : null}

      <form
        action={formAction}
        className="mt-3 flex flex-wrap items-center gap-2"
      >
        <input
          ref={hostRef}
          name="hostname"
          aria-label="New domain"
          placeholder="theirrestaurant.com"
          required
          className="min-w-48 flex-1 rounded-md border border-[var(--color-rule)] bg-transparent px-3 py-2 text-[0.9rem]"
        />
        <button type="submit" disabled={pending} className={ghost}>
          {pending ? "Adding…" : "Add domain"}
        </button>
        {state.error ? (
          <p role="alert" className="basis-full text-[0.8rem]">
            {state.error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
