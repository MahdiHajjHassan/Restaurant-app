import type { Metadata } from "next";
import { Amiri, Cairo, IBM_Plex_Sans_Arabic, Tajawal } from "next/font/google";
import "./globals.css";

/*
 * Every display face is declared here because next/font requires STATIC
 * imports -- a family cannot be selected at runtime. The tenant's theme decides
 * which of these variables --font-display-family resolves to.
 *
 * `preload: false` on all three is load-bearing, not a tuning knob.
 *
 * next/font preloads by default, emitting <link rel="preload"> for every
 * declared family. That forces the browser to fetch all of them regardless of
 * which one the theme actually references -- measured at 21 woff2 files on a
 * single page load, which spends the entire mobile budget on fonts nobody sees.
 * With preload off, the @font-face declarations still exist but the browser
 * fetches a family only when CSS matches it to rendered text, so exactly one
 * display face loads.
 *
 * Verified in the network panel, and re-verify it after touching this block.
 *
 * Each is a genuine Arabic face rather than a Latin family with Arabic bolted
 * on, because Arabic is a first-class language here and not a translation.
 */
const amiri = Amiri({
  subsets: ["latin", "arabic"],
  weight: ["400", "700"],
  variable: "--font-amiri",
  display: "swap",
  preload: false,
});

const cairo = Cairo({
  subsets: ["latin", "arabic"],
  weight: ["400", "700"],
  variable: "--font-cairo",
  display: "swap",
  preload: false,
});

const tajawal = Tajawal({
  subsets: ["latin", "arabic"],
  weight: ["400", "700"],
  variable: "--font-tajawal",
  display: "swap",
  preload: false,
});

/*
 * The body face, and the one that renders the price column: it has true tabular
 * figures, without which prices jitter in width and stop being scannable down
 * the page. Held constant across every pairing for exactly that reason -- the
 * display face is what varies between themes.
 *
 * Two weights, not three. 600 was declared and used exactly once, on the
 * suspended-site notice, which costs every menu visitor two font files for a
 * page almost nobody reaches.
 *
 * `preload: false` here too, and this one was measured rather than assumed.
 * next/font preloads every declared subset, so an English menu was fetching
 * the Arabic subset as a <link rel="preload"> -- competing directly with the
 * LCP image on a throttled connection, which is the one request the score
 * turns on. `display: "swap"` means text still paints immediately in the
 * fallback face; dropping the preload moves the font behind the photo instead
 * of in front of it.
 *
 * Re-verify in the network panel after touching this block. The claim above it
 * was true when written and had quietly stopped being true: seven woff2 files,
 * 183 KB, were arriving on a page that renders two faces.
 */
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["latin", "arabic"],
  weight: ["400", "500"],
  variable: "--font-plex-arabic",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Restaurant Platform",
  description: "Multi-tenant restaurant websites.",
};

/**
 * `lang` and `dir` are set per locale by the tenant routes below this; the
 * values here only apply to the platform's own pages.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={`${amiri.variable} ${cairo.variable} ${tajawal.variable} ${plexArabic.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
