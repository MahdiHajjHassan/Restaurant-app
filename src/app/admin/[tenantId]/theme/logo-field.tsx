"use client";

import Image from "next/image";
import { useActionState, useRef } from "react";
import { updateLogo, type ThemeFormState } from "./actions";

interface LogoFieldProps {
  tenantId: string;
  restaurantName: string;
  currentLogo: {
    storageKey: string;
    width: number;
    height: number;
    blurDataUrl: string | null;
  } | null;
}

const initialState: ThemeFormState = { error: null };

/**
 * Logo upload.
 *
 * Its own form rather than a field on the theme form: a logo is set once at
 * onboarding, while colours get changed repeatedly, and re-posting a file to
 * change a palette would be absurd.
 */
export function LogoField({
  tenantId,
  restaurantName,
  currentLogo,
}: LogoFieldProps) {
  const action = updateLogo.bind(null, tenantId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const removeRef = useRef<HTMLInputElement>(null);

  return (
    <form ref={formRef} action={formAction}>
      <p className="text-[0.85rem] font-medium">Logo</p>

      <div className="mt-2 flex items-start gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--c-surface-sunk)]">
          {currentLogo ? (
            <Image
              src={`/storage/${currentLogo.storageKey}`}
              alt={`${restaurantName} logo`}
              width={currentLogo.width}
              height={currentLogo.height}
              sizes="64px"
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-[0.7rem] text-[var(--c-text-muted)]">None</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <input type="hidden" name="remove" ref={removeRef} value="false" />
          <input
            type="file"
            name="logo"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              if (event.target.files?.[0]) formRef.current?.requestSubmit();
            }}
            className="block w-full text-[0.8rem] file:me-3 file:rounded-md file:border file:border-[var(--c-border-strong)] file:bg-transparent file:px-3 file:py-1.5 file:text-[0.8rem] file:text-[var(--c-text)]"
          />

          <p className="mt-1.5 text-[0.75rem] text-[var(--c-text-muted)]">
            Shown instead of your name at the top of your site. Wide images work
            best — it is displayed 40 pixels tall.
          </p>

          {currentLogo && !pending ? (
            <button
              type="submit"
              onClick={() => {
                if (removeRef.current) removeRef.current.value = "true";
              }}
              className="mt-2 text-[0.78rem] text-[var(--c-brand)] underline"
            >
              Remove logo
            </button>
          ) : null}
        </div>
      </div>

      {pending ? (
        <p role="status" className="mt-2 text-[0.8rem] text-[var(--c-text-muted)]">
          Uploading…
        </p>
      ) : null}

      {state.error ? (
        <p
          role="alert"
          className="mt-2 rounded-md border border-[var(--c-border-strong)] px-3 py-2 text-[0.85rem]"
        >
          {state.error}
        </p>
      ) : null}

      {/*
        The only signal that the change landed.

        Note the Remove button is rendered `currentLogo && !pending`, so it
        disappears the moment submission starts -- its absence says nothing
        about whether the write finished, and must not be treated as
        confirmation by a human or a test.
      */}
      {state.saved && !pending ? (
        <p role="status" className="mt-2 text-[0.85rem] text-[var(--c-brand)]">
          Logo saved.
        </p>
      ) : null}

      {state.removed && !pending ? (
        <p role="status" className="mt-2 text-[0.85rem] text-[var(--c-brand)]">
          Logo removed. Your restaurant name shows instead.
        </p>
      ) : null}
    </form>
  );
}
