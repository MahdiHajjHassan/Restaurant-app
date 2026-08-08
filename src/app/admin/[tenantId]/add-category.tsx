"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { createCategory, type MenuActionState } from "./actions";

const initialState: MenuActionState = { error: null };

const field =
  "rounded-md border border-[var(--color-rule)] bg-transparent px-3 py-2 text-[0.95rem]";

/**
 * One row that creates a section and immediately offers the next.
 *
 * The Arabic name sits here rather than on a later edit screen because there is
 * no category edit screen to put it on, and a restaurant whose customers read
 * Arabic needs its section headings in Arabic from the start.
 */
export function AddCategory({ tenantId }: { tenantId: string }) {
  const action = createCategory.bind(null, tenantId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const nameRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Uncontrolled inputs: React clears an uncontrolled form once its action
  // settles, so the next section can be typed without reaching for the mouse.
  // Only the focus ring and the router are touched here -- both live outside
  // React, which is what an effect is for.
  useEffect(() => {
    if (!state.saved) return;
    nameRef.current?.focus();
    router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-end gap-2">
      <label className="flex min-w-40 flex-1 flex-col gap-1.5">
        <span className="text-[0.8rem] text-[var(--color-muted)]">
          New section
        </span>
        <input
          ref={nameRef}
          name="nameEn"
          placeholder="Starters"
          required
          className={field}
        />
      </label>

      <label className="flex min-w-40 flex-1 flex-col gap-1.5">
        <span className="text-[0.8rem] text-[var(--color-muted)]">
          Arabic name (optional)
        </span>
        <input
          name="nameAr"
          dir="rtl"
          className={field}
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-[0.9rem] font-medium text-[var(--color-on-accent)] disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add section"}
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
          Section added.
        </p>
      ) : null}
    </form>
  );
}
