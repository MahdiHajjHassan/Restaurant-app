import { loadSite } from "@/server/site";

/**
 * Per-tenant sitemap.
 *
 * Each restaurant is its own site on its own domain, so each needs its own
 * sitemap listing both language versions. A single platform-wide sitemap would
 * be useless to them -- and would leak the client list.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ host: string }> },
) {
  const { host } = await params;
  const decoded = decodeURIComponent(host);
  const site = await loadSite(decoded);

  if (!site) return new Response("Not found", { status: 404 });

  const base = `https://${decoded}`;
  const urls = [base, `${base}/ar`];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls
  .map(
    (url) => `  <url>
    <loc>${url}</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${base}"/>
    <xhtml:link rel="alternate" hreflang="ar" href="${base}/ar"/>
  </url>`,
  )
  .join("\n")}
</urlset>`;

  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
