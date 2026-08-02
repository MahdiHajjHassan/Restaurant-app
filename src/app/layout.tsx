import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Restaurant Platform",
  description: "Multi-tenant restaurant websites.",
};

/**
 * Root layout.
 *
 * `lang` and `dir` are hardcoded only for Phase 0. Phase 2 makes them derive
 * from the request locale -- `dir="rtl"` for Arabic -- which is why locale lives
 * in the URL path rather than a cookie: public pages must stay cookie-free to
 * remain fully CDN-cacheable.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
