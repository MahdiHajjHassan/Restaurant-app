"use client";

import { useActionState, useState } from "react";
import { validatePalette } from "@/core/theme/contrast";
import { FONT_PAIRS, type FontPairId } from "@/core/theme/fonts";
import { PALETTES, type PaletteId } from "@/core/theme/palettes";
import {
  LAYOUT_PRESETS,
  themeCssVariables,
  type LayoutPreset,
} from "@/core/theme/resolve";
import { THEME_TOKENS, type PaletteOverrides } from "@/core/theme/tokens";
import { updateTheme, type ThemeFormState } from "./actions";

interface ThemeFormProps {
  tenantId: string;
  restaurantName: string;
  initial: {
    paletteId: PaletteId;
    fontPair: FontPairId;
    preset: LayoutPreset;
    overrides: PaletteOverrides;
  };
  /** Per-token colour entry is an operator capability. */
  isPlatformAdmin: boolean;
}

const initialState: ThemeFormState = { error: null };

const PRESET_LABELS: Record<LayoutPreset, { name: string; hint: string }> = {
  grid: { name: "Photos", hint: "Two columns of photo cards. Best with pictures." },
  list: { name: "List", hint: "Name, dotted line, price. Works with no photos." },
  editorial: { name: "Editorial", hint: "One wide column, larger type." },
};

const TOKEN_LABELS: Record<(typeof THEME_TOKENS)[number], string> = {
  paper: "Background",
  paperSunk: "Card background",
  ink: "Text",
  muted: "Secondary text",
  rule: "Lines",
  accent: "Accent",
  onAccent: "Text on accent",
};

const card =
  "rounded-lg border border-[var(--c-border-strong)] p-3 text-start transition-colors";

export function ThemeForm({
  tenantId,
  restaurantName,
  initial,
  isPlatformAdmin,
}: ThemeFormProps) {
  const action = updateTheme.bind(null, tenantId);
  const [state, formAction, pending] = useActionState(action, initialState);

  const [paletteId, setPaletteId] = useState<PaletteId>(initial.paletteId);
  const [fontPair, setFontPair] = useState<FontPairId>(initial.fontPair);
  const [preset, setPreset] = useState<LayoutPreset>(initial.preset);
  const [overrides, setOverrides] = useState<PaletteOverrides>(
    initial.overrides,
  );

  const candidate = { ...PALETTES[paletteId], ...overrides };
  const issues = validatePalette(candidate);
  const blocking = issues.filter((issue) => issue.severity === "block");
  const warnings = issues.filter((issue) => issue.severity === "warn");

  // The same variables the public site renders, so the preview cannot drift
  // from the real thing.
  const previewVars = themeCssVariables({
    paletteId,
    palette: candidate,
    fontPair,
    preset,
  });

  return (
    <form action={formAction} className="mt-5 flex flex-col gap-7">
      <fieldset>
        <legend className="text-[0.85rem] font-medium">Colours</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(Object.keys(PALETTES) as PaletteId[]).map((id) => (
            <label
              key={id}
              className={`${card} cursor-pointer ${
                paletteId === id
                  ? "border-[var(--c-brand)] ring-1 ring-[var(--c-brand)]"
                  : ""
              }`}
            >
              <input
                type="radio"
                name="paletteId"
                value={id}
                checked={paletteId === id}
                onChange={() => {
                  setPaletteId(id);
                  // Overrides belong to the palette they were made against; a
                  // red accent carried onto a dark palette is rarely intended
                  // and can silently break contrast.
                  setOverrides({});
                }}
                className="sr-only"
              />
              <span className="flex gap-1" aria-hidden="true">
                {(["paper", "ink", "accent"] as const).map((token) => (
                  <span
                    key={token}
                    className="h-6 w-6 rounded-full border border-[var(--c-border-strong)]"
                    style={{ background: PALETTES[id][token] }}
                  />
                ))}
              </span>
              <span className="mt-2 block text-[0.8rem] capitalize">{id}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-[0.85rem] font-medium">Lettering</legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(Object.keys(FONT_PAIRS) as FontPairId[]).map((id) => (
            <label
              key={id}
              className={`${card} cursor-pointer ${
                fontPair === id
                  ? "border-[var(--c-brand)] ring-1 ring-[var(--c-brand)]"
                  : ""
              }`}
            >
              <input
                type="radio"
                name="fontPair"
                value={id}
                checked={fontPair === id}
                onChange={() => setFontPair(id)}
                className="sr-only"
              />
              <span
                className="block text-[1.1rem]"
                style={{ fontFamily: `var(${FONT_PAIRS[id].displayVariable})` }}
              >
                {FONT_PAIRS[id].label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-[0.85rem] font-medium">Layout</legend>
        <div className="mt-2 flex flex-col gap-2">
          {LAYOUT_PRESETS.map((id) => (
            <label
              key={id}
              className={`${card} flex cursor-pointer flex-col ${
                preset === id
                  ? "border-[var(--c-brand)] ring-1 ring-[var(--c-brand)]"
                  : ""
              }`}
            >
              <input
                type="radio"
                name="preset"
                value={id}
                checked={preset === id}
                onChange={() => setPreset(id)}
                className="sr-only"
              />
              <span className="text-[0.85rem]">{PRESET_LABELS[id].name}</span>
              <span className="text-[0.75rem] text-[var(--c-text-muted)]">
                {PRESET_LABELS[id].hint}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {isPlatformAdmin ? (
        <fieldset>
          <legend className="text-[0.85rem] font-medium">
            Exact colours{" "}
            <span className="font-normal text-[var(--c-text-muted)]">
              (operator only)
            </span>
          </legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {THEME_TOKENS.map((token) => {
              const overridden = candidate[token] !== PALETTES[paletteId][token];
              return (
                <label key={token} className="flex items-center gap-2">
                  {/*
                    The visible control is deliberately UNNAMED so it never
                    submits. A named colour input always posts its current
                    value, which would write all seven tokens as explicit
                    overrides on every operator save -- freezing the tenant on
                    today's version of the palette and defeating the whole
                    point of storing overrides sparsely.

                    Only a token that genuinely differs gets a named hidden
                    field, so the payload carries real changes and nothing else.
                  */}
                  <input
                    type="color"
                    data-token={token}
                    value={candidate[token]}
                    aria-label={TOKEN_LABELS[token]}
                    onChange={(event) =>
                      setOverrides((current) => ({
                        ...current,
                        [token]: event.target.value,
                      }))
                    }
                    className="h-8 w-10 shrink-0 rounded border border-[var(--c-border-strong)] bg-transparent"
                  />
                  {overridden ? (
                    <input
                      type="hidden"
                      name={`override.${token}`}
                      value={candidate[token]}
                    />
                  ) : null}
                  <span className="text-[0.78rem]">
                    {TOKEN_LABELS[token]}
                    {overridden ? (
                      <span className="text-[var(--c-text-muted)]"> ·</span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>

          {Object.keys(overrides).length > 0 ? (
            <button
              type="button"
              onClick={() => setOverrides({})}
              className="mt-2 text-[0.78rem] text-[var(--c-brand)] underline"
            >
              Reset colours to the palette
            </button>
          ) : null}
        </fieldset>
      ) : null}

      <section>
        <h2 className="text-[0.85rem] font-medium">Preview</h2>
        {/*
          EVERYTHING BELOW USES --color-*, NOT THE CONSOLE'S --c-*.

          This block renders the tenant's menu, not console chrome, so it has to
          resolve against the palette being previewed. Converting these to
          console tokens would leave the preview showing the console's colours
          whatever the owner picked -- a preview that cannot change is worse
          than none.

          The style attribute below is also how `admin-theme.spec` finds this
          element: `[style*='--color-accent']`, taking the LAST match. Do not
          give any console element an inline style naming that variable.
        */}
        <div
          style={previewVars as React.CSSProperties}
          className="mt-2 rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper)] p-4 text-[var(--color-ink)]"
        >
          <p
            className="text-[1.35rem] leading-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {restaurantName}
          </p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-[0.95rem] font-medium">Grilled Chicken</span>
            <span className="leader" aria-hidden="true" />
            <span className="price text-[0.95rem] font-medium">$12.50</span>
          </div>
          <p className="mt-1 text-[0.8rem] text-[var(--color-muted)]">
            Marinated overnight, served with garlic sauce.
          </p>
          <span className="mt-3 inline-block rounded-full bg-[var(--color-accent)] px-2.5 py-1 text-[0.75rem] text-[var(--color-on-accent)]">
            Open now
          </span>
        </div>
      </section>

      {/*
        Blocking issues are shown before the button so the reason is visible at
        the moment the button is unavailable, rather than below the fold.
        The action re-checks this regardless -- see actions.ts.
      */}
      {blocking.length > 0 ? (
        <div
          role="alert"
          className="rounded-md border border-[var(--c-border-strong)] px-3 py-2 text-[0.85rem]"
        >
          <p className="font-medium">These colours would be hard to read.</p>
          <ul className="mt-1 list-disc ps-4 text-[var(--c-text-muted)]">
            {blocking.map((issue) => (
              <li key={`${issue.foreground}-${issue.background}`}>
                {TOKEN_LABELS[issue.foreground]} on{" "}
                {TOKEN_LABELS[issue.background]} is{" "}
                <span dir="ltr">{issue.ratio.toFixed(1)}:1</span>, needs{" "}
                <span dir="ltr">{issue.required}:1</span>.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <p className="text-[0.8rem] text-[var(--c-text-muted)]">
          Your accent colour is faint against the background. It will still
          save, but links and buttons may be easy to miss.
        </p>
      ) : null}

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
        disabled={pending || blocking.length > 0}
        className="self-start rounded-md bg-[var(--c-brand)] px-4 py-2 text-[0.9rem] font-medium text-[var(--c-brand-fg)] disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save look"}
      </button>
    </form>
  );
}
