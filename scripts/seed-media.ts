/**
 * Gives every seeded dish a placeholder photo.
 *
 *   node scripts/seed-media.ts [tenant-slug]
 *
 * Generated rather than downloaded, so `npm run db:seed` works offline, in CI,
 * and on a fresh machine with no binaries in the repository and no third
 * party's photographs standing in for a client's.
 *
 * These are placeholders, not photography. They exist so the grid preset can be
 * demoed and tested before a restaurant has sent a single picture.
 */
import { config } from "dotenv";
import { Pool } from "pg";
import { processImage } from "../src/core/media/process.ts";
import { tenantScopedKey } from "../src/core/storage/types.ts";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

config({ path: ".env.local", quiet: true });

const slug = process.argv[2] ?? "alpha-grill";

const connectionString =
  process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("MIGRATION_DATABASE_URL or DATABASE_URL must be set.");
  process.exit(1);
}

const storageDir = process.env.STORAGE_LOCAL_DIR ?? "./storage";

/*
 * Warm, food-adjacent tones. Deliberately muted: a placeholder that shouts
 * would make the demo look like the design, and the point is the layout.
 */
const TONES = [
  ["#8a5a2b", "#6d4520"],
  ["#7d6a3f", "#5f5030"],
  ["#8f4a3a", "#6e382c"],
  ["#5f6b4a", "#48523a"],
  ["#8a7250", "#6b583d"],
  ["#6b4f5e", "#523c48"],
];

function placeholderSvg(from: string, to: string): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
       <defs>
         <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
           <stop offset="0%" stop-color="${from}"/>
           <stop offset="100%" stop-color="${to}"/>
         </linearGradient>
       </defs>
       <rect width="1200" height="900" fill="url(#g)"/>
       <circle cx="600" cy="450" r="230" fill="${to}" opacity="0.45"/>
       <circle cx="600" cy="450" r="150" fill="${from}" opacity="0.5"/>
     </svg>`,
  );
}

const pool = new Pool({ connectionString, max: 1 });

try {
  const tenant = await pool.query<{ id: string; name: string }>(
    "SELECT id, name FROM tenants WHERE slug = $1",
    [slug],
  );
  const target = tenant.rows[0];
  if (!target) {
    console.error(`No tenant with slug "${slug}". Run the seed first.`);
    process.exit(1);
  }

  const items = await pool.query<{ id: string; name_en: string }>(
    "SELECT id, name_en FROM items WHERE tenant_id = $1 AND image_id IS NULL ORDER BY sort_order",
    [target.id],
  );

  if (items.rows.length === 0) {
    console.log(`Every dish for ${target.name} already has a photo.`);
    process.exit(0);
  }

  for (const [index, item] of items.rows.entries()) {
    const [from, to] = TONES[index % TONES.length]!;
    const source = await sharp(placeholderSvg(from!, to!)).jpeg().toBuffer();

    // Through the real pipeline, so seeded rows carry the same dimensions,
    // content type and blur placeholder that a genuine upload would.
    const processed = await processImage(new Uint8Array(source));

    const key = tenantScopedKey(target.id, "media", `${randomUUID()}.webp`);
    const full = path.resolve(storageDir, key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, processed.data);

    const media = await pool.query<{ id: string }>(
      `INSERT INTO media (tenant_id, storage_key, content_type, byte_size, width, height, blur_data_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        target.id,
        key,
        processed.contentType,
        processed.data.byteLength,
        processed.width,
        processed.height,
        processed.blurDataUrl,
      ],
    );

    await pool.query("UPDATE items SET image_id = $1 WHERE id = $2", [
      media.rows[0]!.id,
      item.id,
    ]);
  }

  console.log(
    `Gave ${items.rows.length} ${target.name} dishes a placeholder photo.`,
  );
} finally {
  await pool.end();
}
