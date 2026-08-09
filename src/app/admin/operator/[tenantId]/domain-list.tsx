"use client";

import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { Button, Panel, inputClassName } from "@/ui/console";
import {
  attachDomain,
  removeDomain,
  setDomainVerified,
  type OperatorActionState,
} from "../actions";

const initialState: OperatorActionState = { error: null };

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
    <Panel
      title="Addresses"
      /*
        Says what is not built, rather than showing a status that implies a
        check is happening. A verification UI that is trusted and wrong is
        worse than none: it would tell the operator a client's domain is live
        when nothing has looked.
      */
      description="Automatic DNS checking is not built yet — there is no deployed address to point a domain at. Until then, confirm the domain resolves yourself, then mark it verified here. Unverified addresses do not serve the site."
    >
      <ul className="flex flex-col gap-2">
        {domains.map((domain) => (
          <li
            key={domain.id}
            /*
              Verified is the state that decides whether this address serves at
              all -- and it is also the normal case, so it keeps the default
              silver rather than claiming a colour. An unverified domain is not
              an error, it is simply not finished, so it dims rather than turning
              red.
            */
            className={`spine ${
              domain.verified ? "" : "spine-muted"
            } flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-[var(--c-surface-sunk)] px-3 py-2.5`}
          >
            <span className="identifier min-w-0 flex-1 truncate text-[0.875rem]">
              {domain.hostname}
            </span>

            {domain.isPrimary ? (
              <span className="shrink-0 rounded-full bg-[var(--c-brand-soft)] px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-[var(--c-brand)] uppercase">
                Primary
              </span>
            ) : null}

            <span
              /*
                The unfinished one is the one worth noticing. Verified is the
                normal case and stays quiet; "Not verified" carries the warn
                colour, because it is the address that is not serving yet.
              */
              className={`shrink-0 text-[0.75rem] font-medium ${
                domain.verified
                  ? "text-[var(--c-text-muted)]"
                  : "text-[var(--c-warn)]"
              }`}
            >
              {domain.verified ? "Verified" : "Not verified"}
            </span>

            <span className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
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
              >
                {domain.verified ? "Unverify" : "Mark verified"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                aria-label={`Remove ${domain.hostname}`}
                onClick={() =>
                  startBusy(async () => {
                    const result = await removeDomain(tenantId, domain.id);
                    if (result.error) setError(result.error);
                    router.refresh();
                  })
                }
              >
                Remove
              </Button>
            </span>
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="mt-3 text-[0.8rem] text-[var(--c-danger)]">
          {error}
        </p>
      ) : null}

      <form
        action={formAction}
        className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--c-border)] pt-4"
      >
        <input
          ref={hostRef}
          name="hostname"
          aria-label="New domain"
          placeholder="theirrestaurant.com"
          required
          className={`${inputClassName} identifier min-w-48 flex-1`}
        />
        <Button type="submit" pending={pending} pendingLabel="Adding…">
          Add domain
        </Button>
        {state.error ? (
          <p
            role="alert"
            className="basis-full text-[0.8rem] text-[var(--c-danger)]"
          >
            {state.error}
          </p>
        ) : null}
      </form>
    </Panel>
  );
}
