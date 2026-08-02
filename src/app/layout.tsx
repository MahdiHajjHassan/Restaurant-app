import type { Metadata } from "next";
import { Amiri, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";

/*
 * One pairing, both scripts, so English and Arabic read as the same restaurant.
 *
 * Amiri is a Naskh face with a matching Latin, rooted in Arabic typographic
 * tradition rather than being a generic serif with Arabic bolted on. Used with
 * restraint -- restaurant name and category headings only.
 *
 * IBM Plex Sans Arabic carries body text and, critically, the price column: it
 * has true tabular figures, without which prices jitter in width and stop
 * being scannable down the page.
 */
const display = Amiri({
  subsets: ["latin", "arabic"],
  weight: ["400", "700"],
  variable: "--font-display-family",
  display: "swap",
});

const body = IBM_Plex_Sans_Arabic({
  subsets: ["latin", "arabic"],
  weight: ["400", "500", "600"],
  variable: "--font-body-family",
  display: "swap",
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
      className={`${display.variable} ${body.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
