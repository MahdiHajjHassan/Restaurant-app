"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useTransition } from "react";
import {
  createVariant,
  deleteVariant,
  updateVariant,
  type MenuActionState,
} from "../../actions";

const initialState: MenuActionState = { error: null };

const field =
  "rounded-md border border-[var(--color-rule)] bg-transparent px-2 py-1.5 text-[0.9rem]";
const ghost =
  "rounded-md border border-[var(--color-rule)] px-2 py-1 text-[0.75rem] text-[var(--color-muted)] hover:text-[var(--color-ink)] disabled:opacity-60";

export interface VariantRow {
  id: string;
  nameEn: string;
  nameAr: string;
  /** Major units, already converted for display: "12.50". */
  price: string;
}

/**
 * One existing size: edit it in place, or take it off.
 *
 * The delete has no confirmation, deliberately. This is a row on a form the
 * owner is already editing, and its disappearance is immediately visible right
 * where they are looking -- unlike a section, which takes its dishes with it
 * somewhere off screen.
 */
function VariantForm({
  tenantId,
  variant,
  currency,
}: {
  tenantId: string;
  variant: VariantRow;
  currency: string;
}) {
  const action = updateVariant.bind(null, tenantId, variant.id);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [removing, startRemoving] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (state.saved) router.refresh();
  }, [state, router]);

  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input
          name="nameEn"
          defaultValue={variant.nameEn}
          aria-label={`Size name for ${variant.nameEn}`}
          required
          className={`${field} w-28`}
        />
        <input
          name="nameAr"
          defaultValue={variant.nameAr}
          aria-label={`Arabic size name for ${variant.nameEn}`}
          dir="rtl"
          className={`${field} w-28`}
        />
        <input
          name="price"
          type="text"
          inputMode="decimal"
          defaultValue={variant.price}
          aria-label={`Price for ${variant.nameEn} (${currency})`}
          required
          className={`${field} price w-24`}
        />
        <button type="submit" disabled={pending} className={ghost}>
          {pending ? "Saving…" : "Save"}
        </button>
      </form>

      <button
        type="button"
        aria-label={`Remove size ${variant.nameEn}`}
        disabled={removing}
        onClick={() =>
          startRemoving(async () => {
            await deleteVariant(tenantId, variant.id);
            router.refresh();
          })
        }
        className={ghost}
      >
        Remove
      </button>

      {state.error ? (
        <p role="alert" className="basis-full text-[0.8rem]">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p
          role="status"
          className="basis-full text-[0.8rem] text-[var(--color-accent)]"
        >
          Size saved.
        </p>
      ) : null}
    </li>
  );
}

/**
 * Small / Large / Family.
 *
 * Deliberately here and not in the quick-add row: that row's whole value is
 * that it stays two fields wide. Sizes are a second pass over a menu, made on
 * the dish an owner is already editing.
 */
export function VariantsSection({
  tenantId,
  itemId,
  currency,
  variants,
}: {
  tenantId: string;
  itemId: string;
  currency: string;
  variants: VariantRow[];
}) {
  const action = createVariant.bind(null, tenantId, itemId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const nameRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Uncontrolled, like the quick-add row: React clears the form once the
  // action settles, and this effect only touches things outside React.
  useEffect(() => {
    if (!state.saved) return;
    nameRef.current?.focus();
    router.refresh();
  }, [state, router]);

  return (
    <section className="mt-10 border-t border-[var(--color-rule)] pt-5">
      <h2 className="font-display text-base">Sizes</h2>
      <p className="mt-1 text-[0.8rem] text-[var(--color-muted)]">
        Optional. Add Small and Large — each with its own price — and the dish
        shows both on your site.
      </p>

      {variants.length > 0 ? (
        <ul className="mt-3 divide-y divide-[var(--color-rule)]">
          {variants.map((variant) => (
            <VariantForm
              key={variant.id}
              tenantId={tenantId}
              variant={variant}
              currency={currency}
            />
          ))}
        </ul>
      ) : null}

      <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={nameRef}
          name="nameEn"
          aria-label="New size name"
          placeholder="Large"
          required
          className={`${field} w-32`}
        />
        <input
          name="nameAr"
          aria-label="New size Arabic name"
          dir="rtl"
          className={`${field} w-32`}
        />
        <input
          name="price"
          type="text"
          inputMode="decimal"
          aria-label={`New size price (${currency})`}
          placeholder="0.00"
          required
          className={`${field} price w-24`}
        />
        <button type="submit" disabled={pending} className={ghost}>
          {pending ? "Adding…" : "Add size"}
        </button>

        {state.error ? (
          <p role="alert" className="basis-full text-[0.8rem]">
            {state.error}
          </p>
        ) : null}
        {state.saved ? (
          <p
            role="status"
            className="basis-full text-[0.8rem] text-[var(--color-accent)]"
          >
            Size added.
          </p>
        ) : null}
      </form>
    </section>
  );
}
