"use client";

import { useActionState, useEffect, useState } from "react";
import { Button, Field, Panel, inputClassName } from "@/ui/console";
import { createRestaurant, type OperatorActionState } from "../actions";

const initialState: OperatorActionState = { error: null };

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
    /*
     * Three panels rather than one column of fields: what the restaurant is,
     * who owns it, and what it starts with. An operator fills this in with a
     * client watching, and the grouping is what lets them say "now your login"
     * instead of reading down a wall.
     */
    <form action={formAction} className="flex flex-col gap-4">
      <Panel title="The restaurant">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Restaurant name" required>
            <input
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              className={inputClassName}
            />
          </Field>

          <Field
            label="Web address"
            required
            hint={
              <span className="identifier">
                {effectiveSlug || "your-restaurant"}.{platformDomain}
              </span>
            }
          >
            <input
              name="slug"
              value={effectiveSlug}
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(event.target.value);
              }}
              required
              className={`${inputClassName} identifier`}
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Currency" required>
            <input
              name="currency"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              required
              maxLength={3}
              className={inputClassName}
            />
          </Field>

          <Field label="Timezone" required>
            <input
              name="timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              required
              className={inputClassName}
            />
          </Field>

          <Field label="Menu language">
            <select
              name="defaultLocale"
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
              className={inputClassName}
            >
              <option value="en">English</option>
              <option value="ar">Arabic</option>
            </select>
          </Field>
        </div>
      </Panel>

      <Panel
        title="Owner’s login"
        description="If this email already has an account, it keeps its current password and simply gains this restaurant."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" required>
            <input
              name="ownerEmail"
              type="email"
              value={ownerEmail}
              onChange={(event) => setOwnerEmail(event.target.value)}
              required
              className={inputClassName}
            />
          </Field>

          <Field
            label="Initial password"
            required
            hint="Read this out to the owner; it is shown, not masked."
          >
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
              className={`${inputClassName} identifier`}
            />
          </Field>
        </div>
      </Panel>

      <Panel>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[0.9rem]">
          <input
            type="checkbox"
            name="exampleMenu"
            checked={exampleMenu}
            onChange={(event) => setExampleMenu(event.target.checked)}
            className="size-4 accent-[var(--c-brand)]"
          />
          Start with an example menu, for demoing
        </label>
      </Panel>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-[var(--c-danger)] bg-[var(--c-danger-soft)] px-3 py-2.5 text-[0.85rem] text-[var(--c-danger)]"
        >
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        pending={pending}
        pendingLabel="Creating…"
        className="self-start"
      >
        Create restaurant
      </Button>
    </form>
  );
}
