import { withTenant } from "@/core/db/tenant";
import { PALETTES } from "@/core/theme/palettes";
import { createThemeRepository } from "@/core/theme/repository";
import { THEME_TOKENS, type PaletteOverrides } from "@/core/theme/tokens";
import { requireMembership } from "@/server/auth";
import { db } from "@/server/db";
import { PageHeader } from "@/ui/console";
import { LogoField } from "./logo-field";
import { ThemeForm } from "./theme-form";

export default async function ThemeAdminPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const { membership, user } = await requireMembership(tenantId);

  const { theme, logo } = await withTenant(
    db,
    membership.tenantId,
    async (session) => {
      const repo = createThemeRepository(session);
      // Sequential: these share one transaction, and therefore one connection.
      return { theme: await repo.getTheme(), logo: await repo.getLogo() };
    },
  );

  /*
   * Recover just the tokens that differ from the curated palette.
   *
   * getTheme returns a fully RESOLVED palette. Handing that straight back as
   * "overrides" would turn all seven curated colours into explicit overrides
   * the moment the form saved, freezing the tenant on today's version of the
   * palette and defeating the point of storing overrides sparsely.
   */
  const curated = PALETTES[theme.paletteId];
  const overrides: PaletteOverrides = {};
  for (const token of THEME_TOKENS) {
    if (theme.palette[token] !== curated[token]) {
      overrides[token] = theme.palette[token];
    }
  }

  return (
    <main>
      <PageHeader
        title="Look"
        description="Colours, lettering, and layout for your site. Changes show immediately."
      />

      <div className="mb-5 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4 sm:p-5">
        <LogoField
          tenantId={membership.tenantId}
          restaurantName={membership.tenantName}
          currentLogo={logo}
        />
      </div>

      <ThemeForm
        tenantId={membership.tenantId}
        restaurantName={membership.tenantName}
        initial={{
          paletteId: theme.paletteId,
          fontPair: theme.fontPair,
          preset: theme.preset,
          overrides,
        }}
        isPlatformAdmin={user.isPlatformAdmin}
      />
    </main>
  );
}
