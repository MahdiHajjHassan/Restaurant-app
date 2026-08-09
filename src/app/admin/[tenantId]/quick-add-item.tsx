"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { createItem, type MenuActionState } from "./actions";

const initialState: MenuActionState = { error: null };

const field =
  "min-h-11 rounded-lg border border-[var(--c-border-strong)] bg-[var(--c-surface)] px-3 py-2 text-[0.95rem] placeholder:text-[var(--c-text-subtle)]";

/**
 * The fast path, and the reason this phase is designed the way it is.
 *
 * An operator types a 90-item menu during the sale. Through a
 * click -> load -> fill -> save -> back cycle that is an hour; here it is name,
 * price, Enter, and the cursor is already waiting in the next name field. Name
 * and price only -- everything else about a dish is optional and lives on the
 * edit page, where it gets filled in later or never.
 */
export function QuickAddItem({
  tenantId,
  categoryId,
  categoryName,
  currency,
}: {
  tenantId: string;
  categoryId: string;
  categoryName: string;
  currency: string;
}) {
  const action = createItem.bind(null, tenantId, categoryId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const nameRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  /*
   * The inputs are uncontrolled on purpose. React resets an uncontrolled form
   * once its action settles, which is exactly the clearing this row needs --
   * and mirroring the values into state instead would mean calling setState
   * from this effect, which cascades renders and the compiler rejects.
   *
   * What is left here talks to things outside React: the DOM focus ring, and
   * the router. Focus first, then refresh, so the cursor is already waiting in
   * the name field while the new row renders.
   */
  useEffect(() => {
    if (!state.saved) return;
    nameRef.current?.focus();
    router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      {/*
        Labels name their section. There is one of these rows per section, so an
        unqualified "Dish name" would be ambiguous to a screen reader and would
        match several elements from a test.
      */}
      <input
        ref={nameRef}
        name="nameEn"
        aria-label={`New dish in ${categoryName}`}
        placeholder="Add a dish"
        required
        className={`${field} min-w-40 flex-1`}
      />
      {/*
        inputMode="decimal" brings up a numeric keypad on a phone, which is
        where an owner adds the dish they forgot.
      */}
      <input
        name="price"
        type="text"
        inputMode="decimal"
        aria-label={`Price for new dish in ${categoryName} (${currency})`}
        placeholder="0.00"
        required
        className={`${field} price w-24 shrink-0`}
      />
      <button
        type="submit"
        disabled={pending}
        aria-label={`Add dish to ${categoryName}`}
        className="min-h-11 shrink-0 rounded-lg bg-[var(--c-brand)] px-4 text-[0.875rem] font-medium text-[var(--c-brand-fg)] disabled:opacity-55"
      >
        {pending ? "Adding…" : "Add"}
      </button>

      {state.error ? (
        <p
          role="alert"
          className="basis-full text-[0.8rem] text-[var(--c-danger)]"
        >
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p
          role="status"
          className="basis-full text-[0.8rem] font-medium text-[var(--c-text)]"
        >
          Added to {categoryName}.
        </p>
      ) : null}
    </form>
  );
}
