"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withTenant } from "@/core/db/tenant";
import { validatePalette } from "@/core/theme/contrast";
import { FONT_PAIRS, type FontPairId } from "@/core/theme/fonts";
import { PALETTES, type PaletteId } from "@/core/theme/palettes";
import { createThemeRepository } from "@/core/theme/repository";
import { LAYOUT_PRESETS } from "@/core/theme/resolve";
import { THEME_TOKENS, type PaletteOverrides } from "@/core/theme/tokens";
import { requireMembership } from "@/server/auth";
import { db } from "@/server/db";

export interface ThemeFormState {
  error: string | null;
  saved?: boolean;
}

const paletteIds = Object.keys(PALETTES) as [PaletteId, ...PaletteId[]];
const fontPairIds = Object.keys(FONT_PAIRS) as [FontPairId, ...FontPairId[]];

const HEX = /^#[0-9a-f]{6}$/i;

const schema = z.object({
  paletteId: z.enum(paletteIds),
  fontPair: z.enum(fontPairIds),
  preset: z.enum(LAYOUT_PRESETS),
});

export async function updateTheme(
  tenantId: string,
  _previous: ThemeFormState,
  formData: FormData,
): Promise<ThemeFormState> {
  const { membership, user } = await requireMembership(
    z.string().uuid().parse(tenantId),
  );

  const parsed = schema.safeParse({
    paletteId: formData.get("paletteId"),
    fontPair: formData.get("fontPair"),
    preset: formData.get("preset"),
  });

  if (!parsed.success) {
    return { error: "That is not one of the available options." };
  }

  /*
   * Per-token colours are an operator capability, not an owner one.
   *
   * Hiding the controls is not a check. An owner can post these fields
   * directly, so the refusal has to live here -- the same reasoning that puts
   * requireMembership in every action rather than trusting the layout guard.
   */
  const overrides: PaletteOverrides = {};
  if (user.isPlatformAdmin) {
    for (const token of THEME_TOKENS) {
      const value = formData.get(`override.${token}`);
      if (typeof value !== "string" || value.length === 0) continue;

      if (!HEX.test(value)) {
        return { error: `${token} must be a six-digit hex colour like #1a1a17.` };
      }
      overrides[token] = value;
    }
  }

  const candidate = { ...PALETTES[parsed.data.paletteId], ...overrides };

  /*
   * Contrast is enforced here, not only in the browser.
   *
   * A theming product that lets an owner make their own menu unreadable is an
   * accessibility failure they cannot see coming and a support call you cannot
   * bill for. The blocked pairs are text; a low-contrast accent only warns,
   * and warnings do not reach this branch.
   */
  const blocking = validatePalette(candidate).filter(
    (issue) => issue.severity === "block",
  );

  if (blocking.length > 0) {
    const [issue] = blocking;
    return {
      error:
        `Those colours are not readable: ${issue!.foreground} on ${issue!.background} ` +
        `is ${issue!.ratio.toFixed(1)}:1, and needs at least ${issue!.required}:1.`,
    };
  }

  await withTenant(db, membership.tenantId, async (session) => {
    await createThemeRepository(session).saveTheme({
      paletteId: parsed.data.paletteId,
      overrides,
      fontPair: parsed.data.fontPair,
      preset: parsed.data.preset,
    });
  });

  revalidatePath(`/${membership.tenantId}/theme`);
  return { error: null, saved: true };
}
