import { eq } from "drizzle-orm";
import { themeSettings } from "../db/schema";
import type { TenantSession } from "../db/tenant";
import type { FontPairId } from "./fonts";
import type { PaletteId } from "./palettes";
import { resolveTheme, type LayoutPreset, type ResolvedTheme } from "./resolve";
import type { PaletteOverrides } from "./tokens";

export interface SaveThemeInput {
  paletteId: PaletteId;
  overrides: PaletteOverrides;
  fontPair: FontPairId;
  preset: LayoutPreset;
}

/**
 * Tenant-scoped access to theme_settings.
 *
 * A tenant with no row yet resolves to the platform default rather than
 * failing: theme is optional configuration, and a missing row must never take a
 * restaurant's menu offline.
 */
export function createThemeRepository(session: TenantSession) {
  return {
    async getTheme(): Promise<ResolvedTheme> {
      const rows = await session.tx
        .select()
        .from(themeSettings)
        .where(eq(themeSettings.tenantId, session.tenantId))
        .limit(1);

      const row = rows[0];

      return resolveTheme({
        paletteId: row?.paletteId ?? null,
        overrides: row?.palette ?? null,
        fontPair: row?.fontPair ?? null,
        preset: row?.preset ?? null,
      });
    },

    async saveTheme(input: SaveThemeInput): Promise<void> {
      await session.tx
        .insert(themeSettings)
        .values({
          tenantId: session.tenantId,
          paletteId: input.paletteId,
          palette: input.overrides,
          fontPair: input.fontPair,
          preset: input.preset,
        })
        .onConflictDoUpdate({
          target: themeSettings.tenantId,
          set: {
            paletteId: input.paletteId,
            palette: input.overrides,
            fontPair: input.fontPair,
            preset: input.preset,
            updatedAt: new Date(),
          },
        });
    },
  };
}
