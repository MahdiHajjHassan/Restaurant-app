"use client";

import { useActionState } from "react";
import { updateHours, type HoursFormState } from "./actions";

export interface DaySlots {
  /** ["09:00", "17:00"] pairs, up to two per day. Empty strings mean unused. */
  slots: { open: string; close: string }[];
}

interface HoursFormProps {
  tenantId: string;
  days: readonly string[];
  initial: readonly DaySlots[];
}

const initialState: HoursFormState = { error: null };

const timeField =
  "price w-full rounded-md border border-[var(--c-border-strong)] bg-transparent px-2 py-1.5 text-[0.85rem]";

export function HoursForm({ tenantId, days, initial }: HoursFormProps) {
  const action = updateHours.bind(null, tenantId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="mt-5 flex flex-col gap-4">
      <p className="text-[0.8rem] text-[var(--c-text-muted)]">
        Leave a row empty to close that day. Use the second row for a split
        shift. A closing time earlier than the opening time means you close
        after midnight — 18:00 to 01:00 is one evening.
      </p>

      <div className="flex flex-col gap-3">
        {days.map((dayName, day) => (
          <fieldset
            key={dayName}
            className="grid grid-cols-[5.5rem_1fr_1fr] items-center gap-2 sm:grid-cols-[7rem_1fr_1fr_1fr_1fr]"
          >
            <legend className="sr-only">{dayName}</legend>
            <span className="text-[0.85rem]">{dayName}</span>

            {[0, 1].map((slot) => (
              <div key={slot} className="contents">
                <input
                  name={`d${day}s${slot}open`}
                  type="time"
                  defaultValue={initial[day]?.slots[slot]?.open ?? ""}
                  aria-label={`${dayName} opens${slot === 1 ? " (second shift)" : ""}`}
                  className={timeField}
                />
                <input
                  name={`d${day}s${slot}close`}
                  type="time"
                  defaultValue={initial[day]?.slots[slot]?.close ?? ""}
                  aria-label={`${dayName} closes${slot === 1 ? " (second shift)" : ""}`}
                  className={timeField}
                />
              </div>
            ))}
          </fieldset>
        ))}
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-[var(--c-border-strong)] px-3 py-2 text-[0.85rem]"
        >
          {state.error}
        </p>
      ) : null}

      {state.saved ? (
        <p role="status" className="text-[0.85rem] text-[var(--c-brand)]">
          Saved. Your site is updated.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-[var(--c-brand)] px-4 py-2 text-[0.9rem] font-medium text-[var(--c-brand-fg)] disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save hours"}
      </button>
    </form>
  );
}
