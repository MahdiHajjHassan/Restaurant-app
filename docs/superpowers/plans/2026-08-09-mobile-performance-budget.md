# Mobile Performance Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure the Lighthouse mobile performance score of the grid preset at a realistic 90-dish menu, and fix whatever falls short of 95.

**Architecture:** A throwaway `perf-lab` tenant is built by a repeatable script that writes through the same repository layer the admin uses, with 90 distinct generated photos calibrated to photograph weight. A second script drives Lighthouse against a production build on a dedicated port, three runs, median reported, cold and warm separately. Fixes follow the audit; the first is applied to `ItemCard`, which never marks an above-the-fold photo as priority.

**Tech Stack:** Node 24 ESM scripts, `sharp` (already a dependency), `pg`, `dotenv`, `lighthouse` (new devDependency), Next 16 production build.

## Global Constraints

- **Never touch the seeded demo tenants.** `alpha-grill`, `beta-bistro`, `gamma-cafe` and `unverified` are read-only for the whole browser suite; `menu.spec`, `tenant-resolution.spec` and `theming.spec` assert against them in parallel. All perf work lives on a separate `perf-lab` tenant.
- **`src/core/` may not import `next/*`, `react`, or `react-dom`.** ESLint error, enforced in CI.
- **Money is integer minor units.** `1250`, never floats. Currency lives on the tenant.
- **Localization is paired columns** — `name_en` / `name_ar`, English as the fallback when Arabic is blank.
- **Never `Promise.all` queries that share a transaction.** Sequential awaits only.
- **Scripts read `MIGRATION_DATABASE_URL` from `.env.local`** via `dotenv`, and live in the project root's `scripts/` so Node resolves `pg`, `dotenv` and `sharp`.
- **`domains.hostname` stores no port.** Build it with `platformSubdomain(slug)` from `src/server/platform.ts`.
- **Measure against `next build` + `next start` only.** Development-mode numbers are meaningless.
- **Port 3200 for the perf server.** 3000 is the dev server, 3100 is the browser suite.
- **Lighthouse default mobile preset.** Do not loosen throttling.
- **The fixture must fail loudly rather than degrade quietly.** Follow the pattern in `scripts/make-image-fixtures.mjs`, which throws when its EXIF fixture would prove nothing.
- Target photo band after `processImage()`: **100–400 KB** per stored WebP.

---

### Task 1: Photograph-weight dish photo generator

The load-bearing risk of the whole exercise. Seeded placeholders are 3,132 bytes and byte-identical; a real photo is 100× that. If this task produces flat gradients, every number downstream is a lie.

**Files:**
- Create: `scripts/perf/dish-photo.mjs`

**Interfaces:**
- Produces: `generateDishPhoto(seed: number): Promise<Buffer>` — a JPEG buffer resembling a phone photo of a plated dish, 2400×1800, deterministic for a given seed.
- Produces: `PHOTO_BAND = { minBytes: 100_000, maxBytes: 400_000 }`

- [ ] **Step 1: Write the generator**

```js
import sharp from "sharp";

/** The band a phone photo lands in after processImage() re-encodes it. */
export const PHOTO_BAND = { minBytes: 100_000, maxBytes: 400_000 };

const WIDTH = 2400;
const HEIGHT = 1800;

/** Mulberry32 — deterministic, so a given seed always yields the same photo. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A photograph's file size comes from detail that survives compression, at
 * every scale at once: broad tonal drift, the texture of food, and fine
 * sensor grain. A flat gradient has none of it and compresses to nothing,
 * which is exactly why the existing 3 KB placeholders cannot be measured
 * against.
 */
async function noiseLayer(random, width, height, blurRadius, opacity) {
  const channels = 3;
  const pixels = Buffer.alloc(width * height * channels);
  for (let i = 0; i < pixels.length; i += 1) {
    pixels[i] = Math.floor(random() * 256);
  }
  const layer = sharp(pixels, { raw: { width, height, channels } }).resize(
    WIDTH,
    HEIGHT,
    { kernel: "cubic" },
  );
  const blurred = blurRadius > 0 ? layer.blur(blurRadius) : layer;
  return {
    input: await blurred.png().toBuffer(),
    blend: "overlay",
    opacity,
  };
}

export async function generateDishPhoto(seed) {
  const random = rng(seed);

  // Warm plate-and-food tones, varied per dish so no two photos are alike.
  const hue = Math.floor(random() * 60); // reds through yellows
  const base = { r: 120 + hue, g: 80 + Math.floor(random() * 50), b: 55 };

  const plateX = WIDTH / 2;
  const plateY = HEIGHT / 2;
  const plateR = 620 + Math.floor(random() * 120);

  // Garnish speckle: small, high-contrast, and everywhere. This is what makes
  // the encoder work, the same way real food does.
  const speckles = Array.from({ length: 260 }, () => {
    const angle = random() * Math.PI * 2;
    const dist = Math.sqrt(random()) * plateR * 0.82;
    const cx = plateX + Math.cos(angle) * dist;
    const cy = plateY + Math.sin(angle) * dist;
    const rr = 6 + random() * 26;
    const shade = Math.floor(random() * 190);
    return `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rr.toFixed(1)}" ry="${(rr * (0.6 + random() * 0.7)).toFixed(1)}" fill="rgb(${shade},${Math.floor(shade * 0.7)},${Math.floor(shade * 0.45)})" opacity="${(0.35 + random() * 0.5).toFixed(2)}"/>`;
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
    <defs>
      <radialGradient id="cloth" cx="50%" cy="45%" r="75%">
        <stop offset="0%" stop-color="rgb(${base.r},${base.g},${base.b})"/>
        <stop offset="100%" stop-color="rgb(${Math.floor(base.r * 0.42)},${Math.floor(base.g * 0.42)},${Math.floor(base.b * 0.5)})"/>
      </radialGradient>
      <radialGradient id="plate" cx="42%" cy="38%" r="70%">
        <stop offset="0%" stop-color="#f2ece1"/>
        <stop offset="70%" stop-color="#ddd4c6"/>
        <stop offset="100%" stop-color="#b8ac9b"/>
      </radialGradient>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#cloth)"/>
    <ellipse cx="${plateX}" cy="${plateY}" rx="${plateR}" ry="${plateR * 0.94}" fill="url(#plate)"/>
    <ellipse cx="${plateX}" cy="${plateY}" rx="${plateR * 0.72}" ry="${plateR * 0.67}" fill="rgb(${Math.floor(base.r * 0.75)},${Math.floor(base.g * 0.62)},${Math.floor(base.b * 0.55)})" opacity="0.9"/>
    ${speckles}
  </svg>`;

  return sharp(Buffer.from(svg))
    .composite([
      await noiseLayer(random, 300, 225, 12, 0.5), // coarse tonal drift
      await noiseLayer(random, 900, 675, 3, 0.35), // food texture
      await noiseLayer(random, 2400, 1800, 0, 0.16), // sensor grain
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}
```

- [ ] **Step 2: Run it against the real pipeline and read the byte sizes**

This is the test. It runs the generator through `processImage()` — the exact function an owner's upload goes through — and prints what lands on disk.

```bash
node -e "
import('./scripts/perf/dish-photo.mjs').then(async (m) => {
  const { processImage } = await import('./src/core/media/process.ts');
  const sizes = [];
  for (let i = 0; i < 5; i++) {
    const src = await m.generateDishPhoto(i);
    const out = await processImage(new Uint8Array(src));
    sizes.push(out.data.byteLength);
    console.log(\`seed \${i}: source \${src.length} -> stored \${out.data.byteLength} bytes, \${out.width}x\${out.height}, blur \${out.blurDataUrl.length} chars\`);
  }
  const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  console.log('mean stored:', Math.round(mean), 'bytes');
  console.log(mean >= m.PHOTO_BAND.minBytes && mean <= m.PHOTO_BAND.maxBytes ? 'IN BAND' : 'OUT OF BAND — tune quality/noise and repeat');
});
"
```

Expected: five *different* byte sizes, mean between 100,000 and 400,000, dimensions 1600×1200. If the mean is out of band, adjust the noise opacities in Step 1 and re-run until it is in band. Do not proceed on an out-of-band fixture.

- [ ] **Step 3: Commit**

```bash
git add scripts/perf/dish-photo.mjs
git commit -m "Generate dish photos that weigh what photographs weigh"
```

---

### Task 2: The 90-dish perf-lab tenant

**Files:**
- Create: `scripts/perf/seed-perf-menu.ts`

**Interfaces:**
- Consumes: `generateDishPhoto(seed)` and `PHOTO_BAND` from Task 1.
- Consumes: `processImage` from `src/core/media/process.ts`, `tenantScopedKey` from `src/core/storage/types.ts`, `hashPassword` from `src/core/auth/password.ts`, `createRestaurant` from `src/core/platform/repository.ts`.
- Produces: a tenant with slug `perf-lab`, hostname `perf-lab.localhost`, owner `owner@perf-lab.test` / `demo-password-123`, 8 visible categories, 90 items each with a photo, grid preset.

- [ ] **Step 1: Write the seed script**

Key decisions, all deliberate:
- **Resets what it owns** — deletes the `perf-lab` tenant and its storage directory first, so a measurement always starts from a known state.
- Uses `createRestaurant()` rather than raw inserts, so the tenant, its verified subdomain, its owner and their membership come into existence through the same path the operator console uses.
- Items are inserted with an explicit `tenantId` because this script runs as the migration role, outside a `withTenant` session. That is acceptable in a script; it is not acceptable in application code.
- Sequential awaits throughout.

```ts
/**
 * Builds a realistic 90-dish menu on a throwaway `perf-lab` tenant, for
 * measuring the mobile performance budget.
 *
 *   node scripts/perf/seed-perf-menu.ts
 *
 * A separate tenant on purpose: the seeded demo tenants are read-only for the
 * whole browser suite, and three spec files assert against them in parallel.
 *
 * A script rather than quick-add because the menu has to be rebuilt
 * identically after every fix. Quick-add's own cost was measured in Phase 4c
 * (149 ms median, flat as the list grew); re-proving it is not the point here.
 */
import { config } from "dotenv";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../src/core/db/client.ts";
import { createRestaurant } from "../../src/core/platform/repository.ts";
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
      ["Hummus", "حمص", 550], ["Moutabal", "متبل", 600],
      ["Tabbouleh", "تبولة", 650], ["Fattoush", "فتوش", 650],
      ["Warak Enab", "ورق عنب", 700], ["Labneh", "لبنة", 500],
      ["Muhammara", "محمرة", 700], ["Shanklish", "شنكليش", 750],
      ["Baba Ghanoush", "بابا غنوج", 600], ["Loubieh b'Zeit", "لوبية بزيت", 600],
      ["Makdous", "مكدوس", 700], ["Kebbeh Nayyeh", "كبة نية", 1400],
    ],
  },
  {
    en: "Hot Mezze",
    ar: "مقبلات ساخنة",
    dishes: [
      ["Falafel", "فلافل", 600], ["Kebbeh Maqlieh", "كبة مقلية", 850],
      ["Rakakat Jibneh", "رقاقات جبنة", 750], ["Sujuk", "سجق", 900],
      ["Makanek", "مقانق", 900], ["Batata Harra", "بطاطا حرة", 650],
      ["Foul Moudammas", "فول مدمس", 550], ["Balila", "بليلة", 550],
      ["Jawaneh", "جوانح", 850], ["Arayes", "عرايس", 950],
      ["Fatayer Sabanekh", "فطاير سبانخ", 700],
    ],
  },
  {
    en: "From the Grill",
    ar: "من المشاوي",
    dishes: [
      ["Shish Taouk", "شيش طاووق", 1450], ["Lahm Meshwi", "لحم مشوي", 1750],
      ["Kafta Khashkhash", "كفتة خشخاش", 1500], ["Riyash", "ريش", 1950],
      ["Shish Kebab", "شيش كباب", 1650], ["Farrouj Meshwi", "فروج مشوي", 1400],
      ["Kastaleta", "كستليتة", 2100], ["Mixed Grill", "مشاوي مشكلة", 2600],
      ["Kebab Halabi", "كباب حلبي", 1700], ["Tawouk Deluxe", "طاووق ديلوكس", 1600],
      ["Lamb Chops", "ريش غنم", 2400], ["Kafta b'Tahini", "كفتة بالطحينة", 1550],
    ],
  },
  {
    en: "Sandwiches",
    ar: "سندويشات",
    dishes: [
      ["Shawarma Djaj", "شاورما دجاج", 750], ["Shawarma Lahm", "شاورما لحم", 850],
      ["Taouk Sandwich", "سندويش طاووق", 700], ["Kafta Sandwich", "سندويش كفتة", 750],
      ["Falafel Sandwich", "سندويش فلافل", 500], ["Halloumi Sandwich", "سندويش حلوم", 650],
      ["Soujok Sandwich", "سندويش سجق", 700], ["Makanek Sandwich", "سندويش مقانق", 700],
      ["Zaatar Manoushe", "منقوشة زعتر", 300], ["Jebneh Manoushe", "منقوشة جبنة", 450],
      ["Lahm b'Ajin", "لحم بعجين", 500],
    ],
  },
  {
    en: "Salads",
    ar: "سلطات",
    dishes: [
      ["Rocket Salad", "سلطة جرجير", 700], ["Green Salad", "سلطة خضراء", 600],
      ["Beetroot Salad", "سلطة شمندر", 650], ["Quinoa Salad", "سلطة كينوا", 850],
      ["Halloumi Salad", "سلطة حلوم", 950], ["Chicken Caesar", "سيزر بالدجاج", 1050],
      ["Tomato & Onion", "سلطة بندورة وبصل", 550], ["Cabbage Salad", "سلطة ملفوف", 500],
      ["Purslane Salad", "سلطة بقلة", 650],
    ],
  },
  {
    en: "Main Dishes",
    ar: "أطباق رئيسية",
    dishes: [
      ["Molokhia", "ملوخية", 1350], ["Mloukhieh b'Djaj", "ملوخية بالدجاج", 1450],
      ["Kebbeh b'Laban", "كبة باللبن", 1500], ["Sayadieh", "صيادية", 1800],
      ["Freekeh b'Djaj", "فريكة بالدجاج", 1400], ["Maqlouba", "مقلوبة", 1500],
      ["Riz a Djaj", "رز على دجاج", 1350], ["Fasolia b'Lahmeh", "فاصوليا باللحمة", 1300],
      ["Bamieh b'Lahmeh", "بامية باللحمة", 1300], ["Shish Barak", "شيش برك", 1450],
      ["Samke Harra", "سمكة حرة", 2200],
    ],
  },
  {
    en: "Desserts",
    ar: "حلويات",
    dishes: [
      ["Baklava", "بقلاوة", 650], ["Knefeh", "كنافة", 750],
      ["Mouhalabieh", "مهلبية", 500], ["Osmalieh", "عثملية", 800],
      ["Halawet el Jebn", "حلاوة الجبن", 750], ["Aish el Saraya", "عيش السرايا", 700],
      ["Maamoul", "معمول", 550], ["Rice Pudding", "رز بحليب", 500],
      ["Sfouf", "صفوف", 450], ["Namoura", "نمورة", 500],
    ],
  },
  {
    en: "Drinks",
    ar: "مشروبات",
    dishes: [
      ["Ayran", "عيران", 300], ["Fresh Lemonade", "ليموناضة", 400],
      ["Jallab", "جلاب", 450], ["Tamarind Juice", "شراب التمر هندي", 450],
      ["Turkish Coffee", "قهوة تركية", 250], ["Espresso", "إسبريسو", 300],
      ["Mint Tea", "شاي بالنعناع", 250], ["Fresh Orange", "عصير برتقال", 500],
      ["Sparkling Water", "مياه غازية", 200], ["Still Water", "مياه", 150],
      ["Almaza Beer", "بيرة ألمازا", 600], ["Arak", "عرق", 900],
      ["Cola", "كولا", 250], ["Iced Tea", "شاي مثلج", 300],
    ],
  },
];

const DESCRIPTIONS_EN = [
  "Slow-cooked overnight and finished to order.",
  "Charcoal-grilled, served with garlic and pickles.",
  "A house recipe, unchanged for thirty years.",
  "Dressed with lemon, olive oil and a little sumac.",
  "Made fresh each morning; when it runs out, it runs out.",
  "Served warm with fresh bread from the oven next door.",
];
const DESCRIPTIONS_AR = [
  "مطبوخ على نار هادئة ويُحضّر عند الطلب.",
  "مشوي على الفحم، يُقدّم مع الثوم والمخلل.",
  "وصفة البيت، لم تتغيّر منذ ثلاثين عاماً.",
  "متبّل بالليمون وزيت الزيتون وقليل من السمّاق.",
  "يُحضّر طازجاً كل صباح، وينفد حين ينفد.",
  "يُقدّم ساخناً مع خبز طازج من الفرن المجاور.",
];

// Both halves of the same client: `db` for the repository call that must go
// through the real path, `pool` for the bulk inserts a script may do directly.
const { db, pool } = createDatabase({ connectionString, maxConnections: 1 });

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
  if (existing.rows[0]) {
    const oldId = existing.rows[0].id;
    await pool.query("DELETE FROM tenants WHERE id = $1", [oldId]);
    await rm(path.resolve(storageDir, "tenants", oldId), {
      recursive: true,
      force: true,
    });
    console.log(`Removed the previous ${SLUG} tenant and its photos.`);
  }

  const created = await createRestaurant(db, {
    slug: SLUG,
    name: "Perf Lab Restaurant",
    currency: "USD",
    timezone: "Asia/Beirut",
    defaultLocale: "en",
    hostname: HOSTNAME,
    ownerEmail: OWNER_EMAIL,
    ownerPasswordHash: await hashPassword(OWNER_PASSWORD),
  });
  if (!created.ok) throw new Error(`createRestaurant failed: ${created.reason}`);
  const tenantId = created.tenantId;

  // The flagship preset, which is the whole reason for this measurement.
  await pool.query(
    `INSERT INTO theme_settings (tenant_id, palette_id, font_pair, preset)
     VALUES ($1, 'crimson', 'modern', 'grid')
     ON CONFLICT (tenant_id) DO UPDATE SET preset = 'grid'`,
    [tenantId],
  );

  let seed = 0;
  const storedSizes: number[] = [];

  for (const [sectionIndex, section] of MENU.entries()) {
    const category = await pool.query<{ id: string }>(
      `INSERT INTO categories (tenant_id, name_en, name_ar, sort_order, is_visible)
       VALUES ($1, $2, $3, $4, true) RETURNING id`,
      [tenantId, section.en, section.ar, sectionIndex],
    );
    const categoryId = category.rows[0]!.id;

    for (const [dishIndex, [en, ar, priceMinor]] of section.dishes.entries()) {
      // Through the real pipeline, so these rows are indistinguishable from
      // a genuine upload: same dimensions, content type and blur placeholder.
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
          tenantId, key, processed.contentType, processed.data.byteLength,
          processed.width, processed.height, processed.blurDataUrl,
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
          tenantId, categoryId, en, ar,
          described ? DESCRIPTIONS_EN[seed % DESCRIPTIONS_EN.length] : null,
          described ? DESCRIPTIONS_AR[seed % DESCRIPTIONS_AR.length] : null,
          priceMinor, mediaRow.rows[0]!.id, !soldOut, dishIndex,
        ],
      );

      if (seed % 5 === 0) {
        await pool.query(
          `INSERT INTO item_variants (tenant_id, item_id, name_en, name_ar, price_minor, sort_order)
           VALUES ($1,$2,'Small','صغير',$3,0), ($1,$2,'Large','كبير',$4,1)`,
          [tenantId, item.rows[0]!.id,
           Math.round(priceMinor * 0.75), Math.round(priceMinor * 1.35)],
        );
      }

      seed += 1;
    }
  }

  const mean = storedSizes.reduce((a, b) => a + b, 0) / storedSizes.length;
  const totalMb = storedSizes.reduce((a, b) => a + b, 0) / 1_000_000;

  // Fail loudly rather than degrade quietly: a fixture that silently becomes
  // lightweight turns a green measurement into a lie.
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
    `Built ${SLUG}: ${MENU.length} sections, ${seed} dishes, all photographed.\n` +
      `Mean photo ${Math.round(mean / 1000)} KB, ${totalMb.toFixed(1)} MB total.\n` +
      `Visit http://${HOSTNAME}:3000  (owner ${OWNER_EMAIL} / ${OWNER_PASSWORD})`,
  );
} finally {
  await pool.end();
}
```

- [ ] **Step 2: Run it**

```bash
node scripts/perf/seed-perf-menu.ts
```

Expected: exits 0, reports 8 sections / 90 dishes, mean photo size inside the band. If it throws on the band check, return to Task 1 Step 2 and re-tune. Note the reported total MB — that is the weight of one restaurant's photography.

- [ ] **Step 3: Look at the page**

Open `http://perf-lab.localhost:3000` in Chrome. Confirm by eye: eight sections, a two-column grid of photographed dishes, prices in Latin digits, a few struck-through sold-out dishes, sizes on some. Then `http://perf-lab.localhost:3000/ar` for the Arabic side — RTL layout, Arabic names, prices still Latin.

- [ ] **Step 4: Commit**

```bash
git add scripts/perf/seed-perf-menu.ts
git commit -m "Build a realistic 90-dish menu for measuring the budget"
```

---

### Task 3: The Lighthouse runner

**Files:**
- Create: `scripts/perf/lighthouse.mjs`
- Modify: `package.json` (devDependency + script)

**Interfaces:**
- Produces: `node scripts/perf/lighthouse.mjs <url> [--runs=3] [--label=name]`, writing `docs/perf/<label>.json` and printing the median score with every failing audit.

- [ ] **Step 1: Install Lighthouse**

```bash
npm install --save-dev lighthouse
```

- [ ] **Step 2: Write the runner**

```js
/**
 * Runs Lighthouse against a URL on the default MOBILE preset and reports the
 * median of N runs.
 *
 *   node scripts/perf/lighthouse.mjs http://perf-lab.localhost:3200/ --runs=3
 *
 * Three runs because a single Lighthouse run is noise, not a measurement.
 * The default preset is not loosened: ">= 95 mobile" in the roadmap means the
 * default mid-tier phone on slow 4G, and any other throttle is incomparable.
 *
 * Chrome specifically: *.localhost resolves in Chrome only, so Node and
 * Playwright's request fixture cannot reach these hosts, but a real Chrome can.
 */
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.argv[2];
if (!url) {
  console.error("Usage: node scripts/perf/lighthouse.mjs <url> [--runs=N] [--label=name]");
  process.exit(1);
}
const runs = Number(process.argv.find((a) => a.startsWith("--runs="))?.split("=")[1] ?? 3);
const label = process.argv.find((a) => a.startsWith("--label="))?.split("=")[1] ?? "run";

const chrome = await chromeLauncher.launch({
  chromeFlags: ["--headless=new", "--no-sandbox"],
});

const results = [];
try {
  for (let i = 0; i < runs; i += 1) {
    const { lhr } = await lighthouse(url, {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      onlyCategories: ["performance"],
    });
    const score = Math.round(lhr.categories.performance.score * 100);
    console.log(`run ${i + 1}/${runs}: ${score}`);
    results.push(lhr);
  }
} finally {
  await chrome.kill();
}

const scores = results.map((r) => Math.round(r.categories.performance.score * 100));
const sorted = [...scores].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
const medianRun = results[scores.indexOf(median)];

const metric = (id) => medianRun.audits[id]?.displayValue ?? "n/a";

console.log(`\n=== ${label} ===`);
console.log(`scores: ${scores.join(", ")}   MEDIAN: ${median}`);
console.log(`  FCP ${metric("first-contentful-paint")}`);
console.log(`  LCP ${metric("largest-contentful-paint")}`);
console.log(`  TBT ${metric("total-blocking-time")}`);
console.log(`  CLS ${metric("cumulative-layout-shift")}`);
console.log(`  Speed Index ${metric("speed-index")}`);

console.log("\nfailing / opportunities:");
for (const audit of Object.values(medianRun.audits)) {
  if (audit.score === null || audit.score >= 0.9) continue;
  const saving = audit.details?.overallSavingsMs;
  console.log(
    `  [${audit.score.toFixed(2)}] ${audit.title}` +
      `${audit.displayValue ? ` — ${audit.displayValue}` : ""}` +
      `${saving ? ` (saves ~${Math.round(saving)} ms)` : ""}`,
  );
}

await mkdir("docs/perf", { recursive: true });
await writeFile(
  `docs/perf/${label}.json`,
  JSON.stringify({ url, scores, median, audits: medianRun.audits }, null, 2),
);
console.log(`\nWrote docs/perf/${label}.json`);

process.exit(median >= 95 ? 0 : 1);
```

- [ ] **Step 3: Add the npm scripts**

In `package.json` `"scripts"`, after `"fixtures"`:

```json
"perf:seed": "node scripts/perf/seed-perf-menu.ts",
"perf:serve": "next start --port 3200",
"perf:measure": "node scripts/perf/lighthouse.mjs"
```

- [ ] **Step 4: Prove the runner works at all**

Against the *existing* five-dish alpha-grill on the dev server, purely to confirm Chrome launches and `*.localhost` resolves. The number itself is meaningless (dev mode); only "it ran" matters.

```bash
node scripts/perf/lighthouse.mjs http://alpha-grill.localhost:3000/ --runs=1 --label=smoke
```

Expected: prints a score and a metric block without erroring. If Chrome is not found, set `CHROME_PATH` to the Playwright Chromium binary and retry.

- [ ] **Step 5: Commit**

```bash
git add scripts/perf/lighthouse.mjs package.json package-lock.json
git commit -m "Add a Lighthouse runner: mobile preset, median of three"
```

---

### Task 4: The baseline measurement

No code. This is the number the whole task exists to produce.

**Files:**
- Create: `docs/perf/grid-90-baseline-cold.json`, `docs/perf/grid-90-baseline-warm.json` (written by the runner)

- [ ] **Step 1: Stop the dev server**

Only one `next dev` per directory, and a production build must not race it.

- [ ] **Step 2: Build for production**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Start the production server on 3200**

```bash
npm run perf:serve
```

- [ ] **Step 4: Measure COLD**

The Next image optimizer caches to `.next/cache/images`. Cold is what the first customer of the day receives, so clear it first.

```bash
rm -rf .next/cache/images && node scripts/perf/lighthouse.mjs http://perf-lab.localhost:3200/ --runs=3 --label=grid-90-baseline-cold
```

- [ ] **Step 5: Measure WARM**

```bash
node scripts/perf/lighthouse.mjs http://perf-lab.localhost:3200/ --runs=3 --label=grid-90-baseline-warm
```

- [ ] **Step 6: Measure the list preset for comparison**

Tells us whether grid is an outlier or the page is heavy in general.

```bash
node -e "
import('dotenv').then(async (d)=>{d.config({path:'.env.local',quiet:true});
const {Pool}=await import('pg');
const p=new Pool({connectionString:process.env.MIGRATION_DATABASE_URL,max:1});
await p.query(\"UPDATE theme_settings SET preset='list' WHERE tenant_id=(SELECT id FROM tenants WHERE slug='perf-lab')\");
await p.end(); console.log('preset -> list');});
"
node scripts/perf/lighthouse.mjs http://perf-lab.localhost:3200/ --runs=3 --label=list-90-baseline
```

Then set it back to `grid` the same way.

- [ ] **Step 7: Record the numbers in the plan and commit the reports**

```bash
git add docs/perf
git commit -m "Baseline: the mobile budget at 90 dishes, measured"
```

---

### Task 5: Give the above-the-fold photos priority

Applied regardless of the audit's exact wording, because it is correct on its own terms: `next/image` defaults to `loading="lazy"`, and a lazily-loaded LCP element is a Lighthouse failure by definition.

**Files:**
- Modify: `src/ui/menu/item-card.tsx`
- Modify: `src/ui/site/site-page.tsx`

**Interfaces:**
- `ItemCard` gains a required-in-practice prop: `priority?: boolean` — when true the photo is eagerly fetched at high priority.

- [ ] **Step 1: Add the prop to `ItemCard`**

In the `ItemCardProps` interface:

```ts
  /**
   * The first few cards are above the fold on a phone, and one of them is the
   * LCP element. next/image lazy-loads by default, which makes the largest
   * paint wait for a scroll that already happened.
   */
  priority?: boolean;
```

Destructure it with a default: `{ item, currency, locale, variant, priority = false }`.

On the `<Image>`, add:

```tsx
            priority={priority}
            fetchPriority={priority ? "high" : "auto"}
```

- [ ] **Step 2: Mark the first cards in `site-page.tsx`**

Replace the `ItemCard` call in the `category.items.map` with an indexed version. The grid is two columns on a phone, so the first four cards of the first section cover the fold:

```tsx
                  {category.items.map((item, index) => (
                    preset === "list" ? (
                      <ItemRow
                        key={item.id}
                        item={item}
                        currency={tenant.currency}
                        locale={locale}
                      />
                    ) : (
                      <ItemCard
                        key={item.id}
                        item={item}
                        currency={tenant.currency}
                        locale={locale}
                        variant={preset === "grid" ? "grid" : "editorial"}
                        priority={categoryIndex === 0 && index < 4}
                      />
                    )
                  ))}
```

and change the enclosing map to `data.menu.map((category, categoryIndex) => (`.

- [ ] **Step 3: Rebuild, restart, re-measure cold**

```bash
npm run build
```
then restart the 3200 server and:
```bash
rm -rf .next/cache/images && node scripts/perf/lighthouse.mjs http://perf-lab.localhost:3200/ --runs=3 --label=grid-90-priority-cold
```

Expected: the "Largest Contentful Paint image was lazily loaded" audit is gone and LCP improves. Record the delta.

- [ ] **Step 4: Run the unit suite**

```bash
npm run verify
```

Expected: green. `ItemCard`'s new prop is optional, so nothing else needs changing.

- [ ] **Step 5: Commit**

```bash
git add src/ui/menu/item-card.tsx src/ui/site/site-page.tsx docs/perf
git commit -m "Stop lazy-loading the photo that is the largest paint"
```

---

### Task 6: Close the remaining gap, audit-led

Driven by what Task 5's re-measurement actually reports, not by guesswork. Apply only the remedies whose audits are still failing, cheapest first, re-measuring after each so every change is attributed to a number.

**Remedy table** — each maps a specific audit to a specific change:

| Audit still failing | Remedy | File |
|---|---|---|
| "Avoid enormous network payloads" / large document | Drop `placeholder="blur"` for cards that are not `priority`. Ninety inlined base64 placeholders are ~27 KB of document that gzip barely compresses, and `aspect-[4/3]` already reserves the space, so there is no CLS cost to removing them. | `src/ui/menu/item-card.tsx` |
| "Properly size images" / "Serve images in next-gen formats" | Tighten `images.imageSizes` / `images.deviceSizes` in `next.config.ts` so the optimizer stops generating widths a two-column phone grid never requests, and set `images.formats: ["image/webp"]`. | `next.config.ts` |
| "Reduce unused JavaScript" / high TBT | Inspect what `MenuControls` ships; the search filter over 90 items is the only client component on the page. | `src/ui/menu/menu-controls.tsx` |
| "Reduce initial server response time" | Confirm `getPublicMenu` is still four queries at 90 items, not an N+1. Log the query count. | `src/core/menu/repository.ts` |
| "Largest Contentful Paint element" still an image far down | Reduce the `priority` count from 4 — on a tall phone the fold may hold fewer cards than assumed. | `src/ui/site/site-page.tsx` |

- [ ] **Step 1: Read the failing audits from the Task 5 report**

```bash
node -e "const r=require('./docs/perf/grid-90-priority-cold.json');for(const a of Object.values(r.audits)){if(a.score!==null&&a.score<0.9)console.log(a.score.toFixed(2),a.title,a.displayValue??'')}"
```

- [ ] **Step 2: Apply the matching remedy, one at a time**

For each, edit the named file, `npm run build`, restart the 3200 server, then:

```bash
rm -rf .next/cache/images && node scripts/perf/lighthouse.mjs http://perf-lab.localhost:3200/ --runs=3 --label=grid-90-fix-<n>-cold
```

Keep the change only if the median improved. Revert it if it did not — an unattributed change is technical debt with no evidence behind it.

- [ ] **Step 3: Stop when the median reaches 95, or when the only remaining remedy changes what a customer sees**

Removing photography from the grid preset and changing what the menu says are both out of scope without the owner's decision. If the gap runs through either, stop and report the numbers.

- [ ] **Step 4: Commit each accepted fix separately**

```bash
git add <files> docs/perf
git commit -m "<what changed and the measured delta>"
```

---

### Task 7: Verify, document, merge

- [ ] **Step 1: Full unit and integration suite**

```bash
npm run verify
```

Expected: green, 230 tests.

- [ ] **Step 2: Browser suite, twice, on its own port**

Stop the 3200 server and any `next dev` first — only one `next dev` per directory, and the suite starts its own.

```bash
E2E_PORT=3100 npm run test:e2e
```

Run it a second time. Both must be green; the seeded demo tenants must be unaffected by `perf-lab` existing.

- [ ] **Step 3: Update `docs/STATUS.md`**

Replace the known gap that reads "The Lighthouse target (≥95 mobile on a 90-item menu) has **never been tested**" with the measured numbers: grid cold, grid warm, list, the mean photo weight the fixture used, and how to reproduce (`npm run perf:seed`, `npm run perf:serve`, `npm run perf:measure`). Update the date line at the top.

- [ ] **Step 4: Merge and clean up**

```bash
npm run verify
git checkout main && git merge perf-mobile-budget
npm run verify
git push origin main
git branch -d perf-mobile-budget
```

Verify twice on purpose: a green run only proves the tree it ran on, and the merged tree is not the tree that was tested.

- [ ] **Step 5: Clean up the clutter**

Delete leftover `e2e-*` tenants from the dev database so the operator console is readable. The suite rebuilds what it needs.
