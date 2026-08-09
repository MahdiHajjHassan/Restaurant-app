/**
 * Builds a realistic 90-dish menu on a throwaway `perf-lab` tenant, for
 * measuring the mobile performance budget.
 *
 *   node scripts/perf/seed-perf-menu.ts
 *
 * A SEPARATE tenant on purpose: the seeded demo tenants are read-only for the
 * whole browser suite, and menu.spec, tenant-resolution.spec and theming.spec
 * assert against them in parallel. Ninety dishes in alpha-grill would break
 * them.
 *
 * A script rather than quick-add because the menu has to be rebuilt
 * identically after every fix, and a measurement that starts from a different
 * fixture each time measures nothing. Quick-add's own cost was measured in
 * Phase 4c -- 149 ms median from Enter to the row appearing, flat as the list
 * grew -- so re-proving it is not what this is for.
 */
import { config } from "dotenv";
import { Pool } from "pg";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
/*
 * Only leaf modules are imported from src/.
 *
 * Node runs .ts by stripping types, which resolves REAL file paths -- so a
 * module whose own relative imports omit the extension (`./schema`) cannot be
 * loaded this way. That rules out core/db/client.ts and therefore
 * createRestaurant, so the tenant is created with the SQL below instead,
 * mirroring what that function does. scripts/seed-media.ts imports under the
 * same constraint, and scripts/db/seed.sql creates the demo tenants the same
 * way.
 */
import { processImage } from "../../src/core/media/process.ts";
import { tenantScopedKey } from "../../src/core/storage/types.ts";
import { hashPassword } from "../../src/core/auth/password.ts";
import { generateDishPhoto, PHOTO_BAND } from "./dish-photo.mjs";

config({ path: ".env.local", quiet: true });

const SLUG = "perf-lab";
const HOSTNAME = "perf-lab.localhost";
const OWNER_EMAIL = "owner@perf-lab.test";
const OWNER_PASSWORD = "demo-password-123";

const connectionString =
  process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("MIGRATION_DATABASE_URL or DATABASE_URL must be set.");
  process.exit(1);
}
const storageDir = process.env.STORAGE_LOCAL_DIR ?? "./storage";

/** Eight sections shaped like a real Lebanese menu, 90 dishes in total. */
const MENU: Array<{
  en: string;
  ar: string;
  dishes: Array<[en: string, ar: string, priceMinor: number]>;
}> = [
  {
    en: "Cold Mezze",
    ar: "مقبلات باردة",
    dishes: [
      ["Hummus", "حمص", 550],
      ["Moutabal", "متبل", 600],
      ["Tabbouleh", "تبولة", 650],
      ["Fattoush", "فتوش", 650],
      ["Warak Enab", "ورق عنب", 700],
      ["Labneh", "لبنة", 500],
      ["Muhammara", "محمرة", 700],
      ["Shanklish", "شنكليش", 750],
      ["Baba Ghanoush", "بابا غنوج", 600],
      ["Loubieh b'Zeit", "لوبية بزيت", 600],
      ["Makdous", "مكدوس", 700],
      ["Kebbeh Nayyeh", "كبة نية", 1400],
    ],
  },
  {
    en: "Hot Mezze",
    ar: "مقبلات ساخنة",
    dishes: [
      ["Falafel", "فلافل", 600],
      ["Kebbeh Maqlieh", "كبة مقلية", 850],
      ["Rakakat Jibneh", "رقاقات جبنة", 750],
      ["Sujuk", "سجق", 900],
      ["Makanek", "مقانق", 900],
      ["Batata Harra", "بطاطا حرة", 650],
      ["Foul Moudammas", "فول مدمس", 550],
      ["Balila", "بليلة", 550],
      ["Jawaneh", "جوانح", 850],
      ["Arayes", "عرايس", 950],
      ["Fatayer Sabanekh", "فطاير سبانخ", 700],
    ],
  },
  {
    en: "From the Grill",
    ar: "من المشاوي",
    dishes: [
      ["Shish Taouk", "شيش طاووق", 1450],
      ["Lahm Meshwi", "لحم مشوي", 1750],
      ["Kafta Khashkhash", "كفتة خشخاش", 1500],
      ["Riyash", "ريش", 1950],
      ["Shish Kebab", "شيش كباب", 1650],
      ["Farrouj Meshwi", "فروج مشوي", 1400],
      ["Kastaleta", "كستليتة", 2100],
      ["Mixed Grill", "مشاوي مشكلة", 2600],
      ["Kebab Halabi", "كباب حلبي", 1700],
      ["Tawouk Deluxe", "طاووق ديلوكس", 1600],
      ["Lamb Chops", "ريش غنم", 2400],
      ["Kafta b'Tahini", "كفتة بالطحينة", 1550],
    ],
  },
  {
    en: "Sandwiches",
    ar: "سندويشات",
    dishes: [
      ["Shawarma Djaj", "شاورما دجاج", 750],
      ["Shawarma Lahm", "شاورما لحم", 850],
      ["Taouk Sandwich", "سندويش طاووق", 700],
      ["Kafta Sandwich", "سندويش كفتة", 750],
      ["Falafel Sandwich", "سندويش فلافل", 500],
      ["Halloumi Sandwich", "سندويش حلوم", 650],
      ["Soujok Sandwich", "سندويش سجق", 700],
      ["Makanek Sandwich", "سندويش مقانق", 700],
      ["Zaatar Manoushe", "منقوشة زعتر", 300],
      ["Jebneh Manoushe", "منقوشة جبنة", 450],
      ["Lahm b'Ajin", "لحم بعجين", 500],
    ],
  },
  {
    en: "Salads",
    ar: "سلطات",
    dishes: [
      ["Rocket Salad", "سلطة جرجير", 700],
      ["Green Salad", "سلطة خضراء", 600],
      ["Beetroot Salad", "سلطة شمندر", 650],
      ["Quinoa Salad", "سلطة كينوا", 850],
      ["Halloumi Salad", "سلطة حلوم", 950],
      ["Chicken Caesar", "سيزر بالدجاج", 1050],
      ["Tomato & Onion", "سلطة بندورة وبصل", 550],
      ["Cabbage Salad", "سلطة ملفوف", 500],
      ["Purslane Salad", "سلطة بقلة", 650],
    ],
  },
  {
    en: "Main Dishes",
    ar: "أطباق رئيسية",
    dishes: [
      ["Molokhia", "ملوخية", 1350],
      ["Mloukhieh b'Djaj", "ملوخية بالدجاج", 1450],
      ["Kebbeh b'Laban", "كبة باللبن", 1500],
      ["Sayadieh", "صيادية", 1800],
      ["Freekeh b'Djaj", "فريكة بالدجاج", 1400],
      ["Maqlouba", "مقلوبة", 1500],
      ["Riz a Djaj", "رز على دجاج", 1350],
      ["Fasolia b'Lahmeh", "فاصوليا باللحمة", 1300],
      ["Bamieh b'Lahmeh", "بامية باللحمة", 1300],
      ["Shish Barak", "شيش برك", 1450],
      ["Samke Harra", "سمكة حرة", 2200],
    ],
  },
  {
    en: "Desserts",
    ar: "حلويات",
    dishes: [
      ["Baklava", "بقلاوة", 650],
      ["Knefeh", "كنافة", 750],
      ["Mouhalabieh", "مهلبية", 500],
      ["Osmalieh", "عثملية", 800],
      ["Halawet el Jebn", "حلاوة الجبن", 750],
      ["Aish el Saraya", "عيش السرايا", 700],
      ["Maamoul", "معمول", 550],
      ["Rice Pudding", "رز بحليب", 500],
      ["Sfouf", "صفوف", 450],
      ["Namoura", "نمورة", 500],
    ],
  },
  {
    en: "Drinks",
    ar: "مشروبات",
    dishes: [
      ["Ayran", "عيران", 300],
      ["Fresh Lemonade", "ليموناضة", 400],
      ["Jallab", "جلاب", 450],
      ["Tamarind Juice", "شراب التمر هندي", 450],
      ["Turkish Coffee", "قهوة تركية", 250],
      ["Espresso", "إسبريسو", 300],
      ["Mint Tea", "شاي بالنعناع", 250],
      ["Fresh Orange", "عصير برتقال", 500],
      ["Sparkling Water", "مياه غازية", 200],
      ["Still Water", "مياه", 150],
      ["Almaza Beer", "بيرة ألمازا", 600],
      ["Arak", "عرق", 900],
      ["Cola", "كولا", 250],
      ["Iced Tea", "شاي مثلج", 300],
    ],
  },
];

const DESCRIPTIONS_EN = [
  "Slow-cooked overnight and finished to order.",
  "Charcoal-grilled, served with garlic and pickles.",
  "A house recipe, unchanged for thirty years.",
  "Dressed with lemon, olive oil and a little sumac.",
  "Made fresh each morning; when it runs out, it runs out.",
  "Served warm with bread from the oven next door.",
];
const DESCRIPTIONS_AR = [
  "مطبوخ على نار هادئة ويُحضّر عند الطلب.",
  "مشوي على الفحم، يُقدّم مع الثوم والمخلل.",
  "وصفة البيت، لم تتغيّر منذ ثلاثين عاماً.",
  "متبّل بالليمون وزيت الزيتون وقليل من السمّاق.",
  "يُحضّر طازجاً كل صباح، وينفد حين ينفد.",
  "يُقدّم ساخناً مع خبز من الفرن المجاور.",
];

const pool = new Pool({ connectionString, max: 1 });

try {
  const total = MENU.reduce((sum, section) => sum + section.dishes.length, 0);
  if (total !== 90) {
    throw new Error(`Menu defines ${total} dishes, expected exactly 90.`);
  }

  // Reset: a measurement must start from a known state.
  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM tenants WHERE slug = $1",
    [SLUG],
  );
  const previous = existing.rows[0];
  if (previous) {
    await pool.query("DELETE FROM tenants WHERE id = $1", [previous.id]);
    await rm(path.resolve(storageDir, "tenants", previous.id), {
      recursive: true,
      force: true,
    });
    console.log(`Removed the previous ${SLUG} tenant and its photos.`);
  }

  /*
   * Tenant, its verified subdomain, its owner and their membership -- the same
   * four rows createRestaurant() writes, in one transaction for the same
   * reason: a tenant with no hostname is invisible to its own owner, and a
   * hostname with no tenant is a dangling record nothing would show.
   *
   * The subdomain is created verified because the platform owns that wildcard.
   * An existing user is REUSED and its password left alone, exactly as the
   * real path does -- a previous run of this script leaves the owner behind,
   * since deleting the tenant only cascades to the membership.
   */
  const tenantId = await (async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const tenant = await client.query<{ id: string }>(
        `INSERT INTO tenants (slug, name, status, currency, timezone, default_locale)
         VALUES ($1, $2, 'trial', 'USD', 'Asia/Beirut', 'en') RETURNING id`,
        [SLUG, "Perf Lab Restaurant"],
      );
      const id = tenant.rows[0]!.id;

      await client.query(
        `INSERT INTO domains (tenant_id, hostname, is_primary, verified_at)
         VALUES ($1, $2, true, now())`,
        [id, HOSTNAME],
      );

      const user = await client.query<{ id: string }>(
        `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id`,
        [OWNER_EMAIL, OWNER_EMAIL.split("@")[0], await hashPassword(OWNER_PASSWORD)],
      );

      await client.query(
        `INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'owner')
         ON CONFLICT DO NOTHING`,
        [id, user.rows[0]!.id],
      );

      await client.query("COMMIT");
      return id;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })();

  // The flagship preset, which is the whole reason for this measurement.
  await pool.query(
    `INSERT INTO theme_settings (tenant_id, palette_id, font_pair, preset)
     VALUES ($1, 'crimson', 'modern', 'grid')
     ON CONFLICT (tenant_id) DO UPDATE SET preset = 'grid'`,
    [tenantId],
  );

  let seed = 0;
  const storedSizes: number[] = [];
  const startedAt = Date.now();

  for (const [sectionIndex, section] of MENU.entries()) {
    const category = await pool.query<{ id: string }>(
      `INSERT INTO categories (tenant_id, name_en, name_ar, sort_order, is_visible)
       VALUES ($1, $2, $3, $4, true) RETURNING id`,
      [tenantId, section.en, section.ar, sectionIndex],
    );
    const categoryId = category.rows[0]!.id;

    for (const [dishIndex, dish] of section.dishes.entries()) {
      const [en, ar, priceMinor] = dish;

      // Through the real pipeline, so these rows are indistinguishable from a
      // genuine upload: same dimensions, content type and blur placeholder.
      const source = await generateDishPhoto(seed);
      const processed = await processImage(new Uint8Array(source));
      storedSizes.push(processed.data.byteLength);

      const key = tenantScopedKey(tenantId, "media", `${randomUUID()}.webp`);
      const full = path.resolve(storageDir, key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, processed.data);

      const mediaRow = await pool.query<{ id: string }>(
        `INSERT INTO media (tenant_id, storage_key, content_type, byte_size, width, height, blur_data_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          tenantId,
          key,
          processed.contentType,
          processed.data.byteLength,
          processed.width,
          processed.height,
          processed.blurDataUrl,
        ],
      );

      // A realistic mix: most dishes described, a few sold out, some sized.
      const described = seed % 3 !== 2;
      const soldOut = seed % 17 === 5;

      const item = await pool.query<{ id: string }>(
        `INSERT INTO items
           (tenant_id, category_id, name_en, name_ar, description_en, description_ar,
            base_price_minor, image_id, is_available, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [
          tenantId,
          categoryId,
          en,
          ar,
          described ? DESCRIPTIONS_EN[seed % DESCRIPTIONS_EN.length] : null,
          described ? DESCRIPTIONS_AR[seed % DESCRIPTIONS_AR.length] : null,
          priceMinor,
          mediaRow.rows[0]!.id,
          !soldOut,
          dishIndex,
        ],
      );

      if (seed % 5 === 0) {
        await pool.query(
          `INSERT INTO item_variants (tenant_id, item_id, name_en, name_ar, price_minor, sort_order)
           VALUES ($1,$2,'Small','صغير',$3,0), ($1,$2,'Large','كبير',$4,1)`,
          [
            tenantId,
            item.rows[0]!.id,
            Math.round(priceMinor * 0.75),
            Math.round(priceMinor * 1.35),
          ],
        );
      }

      seed += 1;
      if (seed % 10 === 0) {
        process.stdout.write(`  ${seed}/90 dishes\n`);
      }
    }
  }

  const totalBytes = storedSizes.reduce((a, b) => a + b, 0);
  const mean = totalBytes / storedSizes.length;

  /*
   * Fail loudly rather than degrade quietly.
   *
   * A fixture that silently becomes lightweight turns a green measurement into
   * a lie, and the lie is invisible: the score simply looks good. Same
   * discipline as make-image-fixtures.mjs, which throws when its EXIF fixture
   * would prove nothing.
   */
  if (mean < PHOTO_BAND.minBytes || mean > PHOTO_BAND.maxBytes) {
    throw new Error(
      `Mean stored photo is ${Math.round(mean)} bytes, outside the ` +
        `${PHOTO_BAND.minBytes}-${PHOTO_BAND.maxBytes} band a real photograph ` +
        "occupies. Measuring against this fixture would prove nothing.",
    );
  }
  if (new Set(storedSizes).size < storedSizes.length * 0.9) {
    throw new Error(
      "Photos are not distinct enough; caching would flatter the measurement.",
    );
  }

  console.log(
    `\nBuilt ${SLUG}: ${MENU.length} sections, ${seed} dishes, all photographed, ` +
      `in ${Math.round((Date.now() - startedAt) / 1000)}s.\n` +
      `Mean photo ${Math.round(mean / 1000)} KB, ` +
      `${(totalBytes / 1_000_000).toFixed(1)} MB of photography in total.\n` +
      `Visit http://${HOSTNAME}:3000  (owner ${OWNER_EMAIL} / ${OWNER_PASSWORD})`,
  );
} finally {
  await pool.end();
}
