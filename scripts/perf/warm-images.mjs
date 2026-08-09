/**
 * Asks the image optimizer to render every dish photo it will be asked for,
 * before a customer asks for it.
 *
 *   node scripts/perf/warm-images.mjs perf-lab.localhost 3200
 *
 * Next resizes on demand and caches the result in .next/cache/images, which a
 * deploy wipes. Measured on a 90-dish grid: the first visitor after a deploy
 * scores 89 and everyone after them scores 97, and the whole difference is
 * sharp doing ninety resizes while somebody waits.
 *
 * This is a DEPLOY STEP, not a runtime feature -- run it after starting the
 * new server and before sending traffic, so the deploy pays that cost instead
 * of the first customer of the day. It matters more in production than it does
 * here: the target box has 4 GB of RAM and shares it with PostgreSQL.
 *
 * Only the widths the layout actually requests are warmed, taken from the
 * `sizes` attribute in ItemCard -- warming every width in deviceSizes would
 * spend minutes rendering images no phone will ever ask for.
 */
import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local", quiet: true });

const host = process.argv[2];
const port = process.argv[3] ?? "3000";
if (!host) {
  console.error("Usage: node scripts/perf/warm-images.mjs <hostname> [port]");
  process.exit(1);
}

/** What a 2-column phone grid and a 3-column desktop grid actually request. */
const WIDTHS = [256, 384, 640, 750];
const QUALITY = 75;

const pool = new Pool({
  connectionString:
    process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL,
  max: 1,
});

let warmed = 0;
let failed = 0;

try {
  const { rows } = await pool.query(
    `SELECT m.storage_key
       FROM media m
       JOIN tenants t ON t.id = m.tenant_id
       JOIN domains d ON d.tenant_id = t.id
      WHERE d.hostname = $1`,
    [host],
  );

  if (rows.length === 0) {
    console.error(`No media for hostname "${host}".`);
    process.exit(1);
  }

  const started = Date.now();

  for (const { storage_key } of rows) {
    for (const width of WIDTHS) {
      const url =
        `http://127.0.0.1:${port}/_next/image` +
        `?url=${encodeURIComponent(`/storage/${storage_key}`)}` +
        `&w=${width}&q=${QUALITY}`;

      // Host header explicitly: *.localhost resolves in Chrome only, so Node
      // has to reach the server by loopback and name the tenant itself.
      const response = await fetch(url, {
        headers: { Host: `${host}:${port}`, Accept: "image/webp,image/*" },
      });
      if (response.ok) {
        await response.arrayBuffer();
        warmed += 1;
      } else {
        failed += 1;
      }
    }
  }

  console.log(
    `Warmed ${warmed} renditions (${rows.length} photos x ${WIDTHS.length} widths) ` +
      `in ${Math.round((Date.now() - started) / 1000)}s` +
      (failed ? `, ${failed} failed` : ""),
  );
} finally {
  await pool.end();
}

process.exit(failed > 0 ? 1 : 0);
