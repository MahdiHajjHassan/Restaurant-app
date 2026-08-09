"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updateItem, type ItemFormState } from "../../actions";

interface ItemFormProps {
  tenantId: string;
  itemId: string;
  currency: string;
  initial: {
    nameEn: string;
    nameAr: string;
    descriptionEn: string;
    descriptionAr: string;
    price: string;
  };
}

const initialState: ItemFormState = { error: null };

const field =
  "rounded-md border border-[var(--c-border-strong)] bg-transparent px-3 py-2 text-[0.95rem]";
const label = "text-[0.8rem] text-[var(--c-text-muted)]";

export function ItemForm({
  tenantId,
  itemId,
  currency,
  initial,
}: ItemFormProps) {
  const action = updateItem.bind(null, tenantId, itemId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={label}>Name (English)</span>
          <input
            name="nameEn"
            defaultValue={initial.nameEn}
            required
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={label}>Name (Arabic)</span>
          <input
            name="nameAr"
            defaultValue={initial.nameAr}
            dir="rtl"
            className={field}
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={label}>Description (English)</span>
          <textarea
            name="descriptionEn"
            defaultValue={initial.descriptionEn}
            rows={3}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={label}>Description (Arabic)</span>
          <textarea
            name="descriptionAr"
            defaultValue={initial.descriptionAr}
            dir="rtl"
            rows={3}
            className={field}
          />
        </label>
      </div>

      <label className="flex max-w-40 flex-col gap-1.5">
        <span className={label}>Price ({currency})</span>
        {/*
          Owners type the price the way they say it -- 12.50 -- and the server
          converts to the integer minor units the database stores. inputMode
          brings up a numeric keypad on a phone, where this gets used.
        */}
        <input
          name="price"
          type="text"
          inputMode="decimal"
          defaultValue={initial.price}
          required
          className={`${field} price`}
        />
      </label>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--c-border-strong)] px-3 py-2 text-[0.85rem]"
        >
          {state.error}
        </p>
      ) : null}

      {state.saved ? (
        <p
          role="status"
          className="text-[0.85rem] text-[var(--c-brand)]"
        >
          Saved. Your site is updated.
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--c-brand)] px-4 py-2 text-[0.9rem] font-medium text-[var(--c-brand-fg)] disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <Link
          href={`/${tenantId}`}
          className="text-[0.85rem] text-[var(--c-text-muted)] hover:text-[var(--c-text)]"
        >
          Back to menu
        </Link>
      </div>
    </form>
  );
}
