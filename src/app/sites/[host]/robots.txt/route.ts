import { loadSite } from "@/server/site";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ host: string }> },
) {
  const { host } = await params;
  const decoded = decodeURIComponent(host);
  const site = await loadSite(decoded);

  // An unknown or suspended host must not invite crawling.
  if (!site) {
    return new Response("User-agent: *\nDisallow: /\n", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const body = `User-agent: *
Allow: /
Sitemap: https://${decoded}/sitemap.xml
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
