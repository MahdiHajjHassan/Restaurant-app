import { storage } from "@/server/storage";

/*
 * Serves stored objects.
 *
 * The local storage driver advertises this prefix and, until now, nothing
 * answered it. The proxy matcher already excludes `storage/`, so requests
 * arrive here without being rewritten onto a tenant segment.
 *
 * The key is pattern-locked to media objects specifically rather than relying
 * on assertSafeKey alone. Keys are attacker-influenced, and a route that will
 * stream any structurally valid key is one traversal bug away from serving
 * whatever else ends up in the bucket. Two independent checks, same reasoning
 * as RLS sitting beneath the repository layer.
 */
const MEDIA_KEY =
  /^tenants\/[0-9a-f-]{36}\/media\/[0-9a-f-]{36}\.webp$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const joined = key.join("/");

  if (!MEDIA_KEY.test(joined)) {
    return new Response("Not found", { status: 404 });
  }

  let bytes: Uint8Array | null;
  try {
    bytes = await storage.get(joined);
  } catch {
    // assertSafeKey rejected it, or the driver failed. Either way the caller
    // learns nothing beyond "not here".
    return new Response("Not found", { status: 404 });
  }

  if (bytes === null) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "image/webp",
      // Keys are uuid-based and an object's content never changes under one,
      // so this can be cached hard. Menus are read on bad connections.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
