import { directionOf, localized, type Locale } from "@/core/i18n/locale";
import { getMessages } from "@/core/i18n/messages";
import { buildRestaurantSchema } from "@/core/seo/json-ld";
import type { Tenant } from "@/core/tenant/repository";
import { MenuControls } from "@/ui/menu/menu-controls";
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
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 pb-16"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      <header className="flex items-start justify-between gap-4 py-8">
        <div>
          <h1 className="font-display text-[1.75rem] leading-tight">
            {tenant.name}
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
                <ul className="mt-3 divide-y divide-[var(--color-rule)]">
                  {category.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      currency={tenant.currency}
                      locale={locale}
                    />
                  ))}
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
  );
}
