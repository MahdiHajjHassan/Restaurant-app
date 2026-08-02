import Image from "next/image";
import { directionOf, localized, type Locale } from "@/core/i18n/locale";
import { getMessages } from "@/core/i18n/messages";
import { buildRestaurantSchema } from "@/core/seo/json-ld";
import type { Tenant } from "@/core/tenant/repository";
import { themeCssVariables } from "@/core/theme/resolve";
import { MenuControls } from "@/ui/menu/menu-controls";
import { ItemCard } from "@/ui/menu/item-card";
import { ItemRow } from "@/ui/menu/item-row";
import { ContactSection } from "./contact-section";
import { OpenBadge } from "./open-badge";
import type { SiteData } from "@/server/site";

interface SitePageProps {
  tenant: Tenant;
  data: SiteData;
  locale: Locale;
  /** Absolute URL of this page, for structured data. */
  url: string;
}

/**
 * A restaurant's public page.
 *
 * The menu IS the page -- no hero, no preamble. This is a reference document
 * someone reads standing at a counter, and the fastest way to help them is to
 * start the list immediately.
 */
export function SitePage({ tenant, data, locale, url }: SitePageProps) {
  const messages = getMessages(locale);
  const direction = directionOf(locale);
  const otherLocaleHref = locale === "ar" ? "./" : "./ar";

  const categories = data.menu.map((category) => ({
    id: category.id,
    label: localized(category.nameEn, category.nameAr, locale),
  }));

  const themeVars = themeCssVariables(data.theme);
  const preset = data.theme.preset;

  /*
   * The three presets differ only in how the item list is arranged. Every one
   * renders the same fields through components that share the sold-out and
   * search behaviour, so switching layout never changes what the menu says.
   */
  const itemListClassName =
    preset === "grid"
      ? "mt-3 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3"
      : preset === "editorial"
        ? "mt-3 flex flex-col gap-8"
        : "mt-3 divide-y divide-[var(--color-rule)]";

  const schema = buildRestaurantSchema({
    name: tenant.name,
    url,
    currency: tenant.currency,
    locale,
    menu: data.menu,
    contact: data.contact,
    hours: data.hours,
  });

  return (
    /*
     * lang and dir sit here rather than on <html>: a page may have only one
     * <html>, and the root layout cannot see a nested route's locale. Both
     * attributes are valid on any element and mirror the layout correctly.
     */
    <div
      lang={locale}
      dir={direction}
      /*
       * Theme tokens ride a React inline style object rather than a <style>
       * tag. React escapes style values, so an owner-supplied colour has no
       * path to becoming CSS syntax -- the injection surface is closed by
       * construction, not only by the validation in themeCssVariables. It also
       * keeps the nonce-based CSP planned for Phase 6 from inheriting an
       * inline-<style> problem.
       *
       * Because the tokens are scoped to this element instead of :root, it has
       * to paint the page background itself.
       */
      style={themeVars as React.CSSProperties}
      className="flex min-h-full flex-1 flex-col bg-[var(--color-paper)] text-[var(--color-ink)]"
    >
      <div
        className={`mx-auto flex w-full flex-1 flex-col px-6 pb-16 ${
          preset === "grid" ? "max-w-4xl" : "max-w-2xl"
        }`}
      >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      <header className="flex items-start justify-between gap-4 py-8">
        <div>
          {/*
            The logo replaces the restaurant name when set, with the name kept
            as alt text so the page still says who it is to a screen reader and
            to search engines.

            Height is capped rather than trusted: an owner uploading a tall
            image could otherwise push the menu below the fold, and the menu
            being immediately visible is the decision this page is built on.
          */}
          <h1 className="font-display text-[1.75rem] leading-tight">
            {data.logo ? (
              <Image
                src={`/storage/${data.logo.storageKey}`}
                alt={tenant.name}
                width={data.logo.width}
                height={data.logo.height}
                sizes="160px"
                placeholder={data.logo.blurDataUrl ? "blur" : "empty"}
                blurDataURL={data.logo.blurDataUrl ?? undefined}
                priority
                className="h-10 w-auto max-w-[60vw] object-contain"
              />
            ) : (
              tenant.name
            )}
          </h1>
          <div className="mt-1.5">
            <OpenBadge
              segments={data.hours}
              timeZone={tenant.timezone}
              labels={messages}
              days={messages.days}
            />
          </div>
        </div>

        <a
          href={otherLocaleHref}
          hrefLang={locale === "ar" ? "en" : "ar"}
          className="shrink-0 rounded-full border border-[var(--color-rule)] px-3 py-1 text-[0.8rem] transition-colors hover:border-[var(--color-accent)]"
        >
          {messages.switchLanguage}
        </a>
      </header>

      {data.menu.length === 0 ? (
        <p className="py-16 text-center text-[var(--color-muted)]">
          {messages.menuEmpty}
        </p>
      ) : (
        <>
          <MenuControls
            categories={categories}
            labels={{
              search: messages.searchLabel,
              placeholder: messages.searchPlaceholder,
              clear: messages.clearSearch,
            }}
          />

          <main className="pt-2">
            {data.menu.map((category) => (
              <section
                key={category.id}
                id={`category-${category.id}`}
                data-category
                className="scroll-mt-16 pt-8"
              >
                <h2 className="font-display text-lg">
                  {localized(category.nameEn, category.nameAr, locale)}
                </h2>
                <ul className={itemListClassName} data-preset={preset}>
                  {category.items.map((item) =>
                    preset === "list" ? (
                      <ItemRow
                        key={item.id}
                        item={item}
                        currency={tenant.currency}
                        locale={locale}
                      />
                    ) : (
                      <ItemCard
                        key={item.id}
                        item={item}
                        currency={tenant.currency}
                        locale={locale}
                        variant={preset === "grid" ? "grid" : "editorial"}
                      />
                    ),
                  )}
                </ul>
              </section>
            ))}

            {/* Toggled by MenuControls when a search matches nothing. An empty
                screen should say what happened, not just go blank. */}
            <p
              id="menu-empty"
              hidden
              className="py-16 text-center text-[0.85rem] text-[var(--color-muted)]"
            >
              {messages.noMatches}
            </p>
          </main>
        </>
      )}

        <ContactSection
          contact={data.contact}
          hours={data.hours}
          locale={locale}
        />
      </div>
    </div>
  );
}
