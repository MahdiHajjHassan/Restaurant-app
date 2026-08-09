"use client";

import { useActionState, useEffect, useState } from "react";
import { createRestaurant, type OperatorActionState } from "../actions";

const initialState: OperatorActionState = { error: null };

const field =
  "rounded-md border border-[var(--color-rule)] bg-transparent px-3 py-2 text-[0.95rem]";
const label = "text-[0.8rem] text-[var(--color-muted)]";

/** Name -> slug, matching isValidSlug: lowercase, digits and hyphens only. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export function CreateRestaurantForm({
  platformDomain,
}: {
  platformDomain: string;
}) {
  const [state, formAction, pending] = useActionState(
    createRestaurant,
    initialState,
  );
  /*
   * Every field is controlled, deliberately.
   *
   * React resets an uncontrolled form once its action settles -- including
   * when the action REJECTED it. Left uncontrolled, a refused submit wiped the
   * owner's email and password, and silently reverted a currency the operator
   * had changed from USD. Losing typed credentials while standing in front of
   * a client is bad; silently reverting a currency is worse, because it looks
   * like it worked and renders every price wrong.
   */
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const [timezone, setTimezone] = useState("Asia/Beirut");
  const [locale, setLocale] = useState("en");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [exampleMenu, setExampleMenu] = useState(false);

  useEffect(() => {
    // Never redirect() from a Server Action here: the admin is reached by a
    // host rewrite, and redirect() would resolve against the app's own route
    // tree and land on the platform home page.
    if (state.target) window.location.assign(state.target);
  }, [state]);

  const effectiveSlug = slugEdited ? slug : slugify(name);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={label}>Restaurant name</span>
          <input
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={label}>Web address</span>
          <input
            name="slug"
            value={effectiveSlug}
            onChange={(event) => {
              setSlugEdited(true);
              setSlug(event.target.value);
            }}
            required
            className={field}
          />
          <span className="text-[0.75rem] text-[var(--color-muted)]">
            {effectiveSlug || "your-restaurant"}.{platformDomain}
          </span>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className={label}>Currency</span>
          <input
            name="currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            required
            maxLength={3}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={label}>Timezone</span>
          <input
            name="timezone"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            required
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={label}>Menu language</span>
          <select
            name="defaultLocale"
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
            className={field}
          >
            <option value="en">English</option>
            <option value="ar">Arabic</option>
          </select>
        </label>
      </div>

      <fieldset className="flex flex-col gap-4 rounded-md border border-[var(--color-rule)] p-4">
        <legend className={label}>Owner&rsquo;s login</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={label}>Email</span>
            <input
              name="ownerEmail"
              type="email"
              value={ownerEmail}
              onChange={(event) => setOwnerEmail(event.target.value)}
              required
              className={field}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={label}>Initial password</span>
            {/*
              Deliberately type="text": the operator reads this out to the owner
              standing next to them. A masked field they cannot see helps
              nobody here, and there is no email adapter to send an invitation
              instead.
            */}
            <input
              name="ownerPassword"
              type="text"
              value={ownerPassword}
              onChange={(event) => setOwnerPassword(event.target.value)}
              required
              minLength={12}
              className={field}
            />
          </label>
        </div>

        <p className="text-[0.75rem] text-[var(--color-muted)]">
          If this email already has an account, it keeps its current password
          and simply gains this restaurant.
        </p>
      </fieldset>

      <label className="flex items-center gap-2 text-[0.85rem]">
        <input
          type="checkbox"
          name="exampleMenu"
          checked={exampleMenu}
          onChange={(event) => setExampleMenu(event.target.checked)}
        />
        Start with an example menu, for demoing
      </label>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--color-rule)] px-3 py-2 text-[0.85rem]"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-[var(--color-accent)] px-4 py-2 text-[0.9rem] font-medium text-[var(--color-on-accent)] disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create restaurant"}
      </button>
    </form>
  );
}
