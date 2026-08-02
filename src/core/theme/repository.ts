import { and, eq } from "drizzle-orm";
import { media, themeSettings } from "../db/schema";
import type { TenantSession } from "../db/tenant";
import type { FontPairId } from "./fonts";
import type { PaletteId } from "./palettes";
import { resolveTheme, type LayoutPreset, type ResolvedTheme } from "./resolve";
import type { PaletteOverrides } from "./tokens";

export interface TenantLogo {
  storageKey: string;
  width: number;
  height: number;
  blurDataUrl: string | null;
}

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

    /**
     * The tenant's logo, or null.
     *
     * Separate from getTheme so ResolvedTheme stays pure data that
     * themeCssVariables can consume -- a logo is presentational content, not a
     * style token, and folding it in would mean core/theme owned a media join.
     */
    async getLogo(): Promise<TenantLogo | null> {
      const rows = await session.tx
        .select({
          storageKey: media.storageKey,
          width: media.width,
          height: media.height,
          blurDataUrl: media.blurDataUrl,
        })
        .from(themeSettings)
        .innerJoin(
          media,
          and(
            eq(media.id, themeSettings.logoId),
            // Scoped explicitly as well as by RLS: a logo is joined by id, and
            // FK checks do not respect row-level security.
            eq(media.tenantId, session.tenantId),
          ),
        )
        .where(eq(themeSettings.tenantId, session.tenantId))
        .limit(1);

      return rows[0] ?? null;
    },

    async setLogo(mediaId: string | null): Promise<void> {
      await session.tx
        .insert(themeSettings)
        .values({ tenantId: session.tenantId, logoId: mediaId })
        .onConflictDoUpdate({
          target: themeSettings.tenantId,
          set: { logoId: mediaId, updatedAt: new Date() },
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
