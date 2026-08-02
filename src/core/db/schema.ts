import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/*
 * Tenant core schema.
 *
 * Conventions that carry real consequences:
 *
 * - Money is `bigint` minor units (1250, not 12.50). Floats are unfixable once
 *   data exists. bigint rather than integer because this platform targets a
 *   market that has lived through hyperinflation -- integer tops out around
 *   2.1e9 minor units, which is a real ceiling for LBP, not a theoretical one.
 *
 * - Localized text is paired _en/_ar columns. Arabic is nullable and falls back
 *   to English. Simpler and faster than a translations table at exactly two
 *   languages; a third language is a deliberate migration.
 *
 * - Every tenant-scoped table carries `tenantId` and gets an RLS policy in the
 *   migration that follows. Tables WITHOUT tenantId (tenants, domains, users)
 *   are resolved before any tenant context exists, which is why they are
 *   deliberately excluded from RLS.
 */

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

// ─── Enums ────────────────────────────────────────────────────────────────

export const tenantStatus = pgEnum("tenant_status", [
  "trial",
  "active",
  "suspended",
]);

export const locale = pgEnum("locale", ["en", "ar"]);

export const membershipRole = pgEnum("membership_role", ["owner", "staff"]);

export const layoutPreset = pgEnum("layout_preset", [
  "grid",
  "list",
  "editorial",
]);

// ─── Platform-level tables (no tenant_id, no RLS) ─────────────────────────

/**
 * A restaurant. `status` and `plan` exist from day one so the billing work in
 * roadmap R5 can suspend a non-paying client without a migration.
 */
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),

  status: tenantStatus("status").notNull().default("trial"),
  plan: text("plan"),

  /** ISO 4217. Drives Intl.NumberFormat -- never hardcode decimal places. */
  currency: char("currency", { length: 3 }).notNull().default("USD"),
  /** IANA zone. "Open now" is wrong without it the moment host and restaurant differ. */
  timezone: text("timezone").notNull().default("Asia/Beirut"),
  defaultLocale: locale("default_locale").notNull().default("en"),

  ...timestamps,
});

/**
 * Hostnames pointing at a tenant. One tenant, many hosts -- a client starts on
 * slug.platform.com and later adds their own domain with no migration.
 */
export const domains = pgTable(
  "domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Stored lowercase; Host headers are case-insensitive. */
    hostname: text("hostname").notNull().unique(),
    isPrimary: boolean("is_primary").notNull().default(false),
    /** Null until DNS is confirmed. Unverified domains must not serve. */
    verifiedAt: timestamp("verified_at", { withTimezone: true }),

    ...timestamps,
  },
  (table) => [index("domains_tenant_id_idx").on(table.tenantId)],
);

/** Platform-level identity. A person may own several restaurants. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  /** You. Grants access to the operator console. */
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  ...timestamps,
});

/**
 * Active login sessions.
 *
 * Only a SHA-256 hash of the session token is stored, never the token itself.
 * A database leak then yields nothing an attacker can present as a session --
 * the same reasoning that applies to passwords, and cheap to get right up
 * front rather than after an incident.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    // Recorded so an owner can be told where a session came from if they ever
    // report something odd.
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

/**
 * Login attempts, for rate limiting.
 *
 * Deliberately in the database rather than in memory: serverless instances are
 * short-lived and numerous, so an in-process counter resets constantly and
 * leaves you believing login is protected when it is not.
 */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Lowercased email, or an IP address. */
    identifier: text("identifier").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("login_attempts_identifier_time_idx").on(
      table.identifier,
      table.attemptedAt,
    ),
  ],
);

// ─── Tenant-scoped tables (RLS applies) ───────────────────────────────────

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull().default("staff"),
    ...timestamps,
  },
  (table) => [
    unique("memberships_tenant_user_key").on(table.tenantId, table.userId),
    index("memberships_user_id_idx").on(table.userId),
  ],
);

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Path in the StorageAdapter, always built via tenantScopedKey(). */
    storageKey: text("storage_key").notNull().unique(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    /** Tiny inline placeholder so photos fade in instead of shifting layout. */
    blurDataUrl: text("blur_data_url"),

    ...timestamps,
  },
  (table) => [index("media_tenant_id_idx").on(table.tenantId)],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    nameEn: text("name_en").notNull(),
    nameAr: text("name_ar"),

    sortOrder: integer("sort_order").notNull().default(0),
    isVisible: boolean("is_visible").notNull().default(true),

    ...timestamps,
  },
  (table) => [
    index("categories_tenant_sort_idx").on(table.tenantId, table.sortOrder),
  ],
);

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),

    nameEn: text("name_en").notNull(),
    nameAr: text("name_ar"),
    descriptionEn: text("description_en"),
    descriptionAr: text("description_ar"),

    imageId: uuid("image_id").references(() => media.id, {
      onDelete: "set null",
    }),

    /** Minor units. Variants may override this. */
    basePriceMinor: bigint("base_price_minor", { mode: "number" }).notNull(),

    /**
     * The control owners touch daily. Sold-out greys the item out rather than
     * deleting it, so tomorrow it comes back with one tap.
     */
    isAvailable: boolean("is_available").notNull().default(true),
    isFeatured: boolean("is_featured").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),

    /** e.g. ["spicy","vegetarian","new"] — validated in core/menu, not the DB. */
    badges: text("badges")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),

    ...timestamps,
  },
  (table) => [
    index("items_tenant_category_sort_idx").on(
      table.tenantId,
      table.categoryId,
      table.sortOrder,
    ),
  ],
);

/** Small / Large / Family. Needed even for a browse-only menu. */
export const itemVariants = pgTable(
  "item_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),

    nameEn: text("name_en").notNull(),
    nameAr: text("name_ar"),
    priceMinor: bigint("price_minor", { mode: "number" }).notNull(),
    isAvailable: boolean("is_available").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),

    ...timestamps,
  },
  (table) => [
    index("item_variants_tenant_item_sort_idx").on(
      table.tenantId,
      table.itemId,
      table.sortOrder,
    ),
  ],
);

/**
 * One row per tenant. Palette and fonts render as CSS variables, which is what
 * makes per-restaurant theming free: no per-client CSS build.
 */
export const themeSettings = pgTable("theme_settings", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),

  /** Key into the curated palettes. Overrides layer on top of this. */
  paletteId: text("palette_id").notNull().default("paper"),

  /**
   * SPARSE per-token overrides, not a full palette: { accent: "#c8102e" }.
   * Tokens are paper, paperSunk, ink, muted, rule, accent, onAccent.
   *
   * Storing only what the owner actually changed means an untouched token keeps
   * following the curated palette, so improving a palette improves every client
   * still on it rather than only new signups.
   */
  palette: jsonb("palette")
    .notNull()
    .default(sql`'{}'::jsonb`),
  /** Key into the curated pairings; every pairing includes an Arabic face. */
  fontPair: text("font_pair").notNull().default("classic"),
  preset: layoutPreset("preset").notNull().default("list"),

  logoId: uuid("logo_id").references(() => media.id, { onDelete: "set null" }),
  heroId: uuid("hero_id").references(() => media.id, { onDelete: "set null" }),

  /** Operator-only. Lets a paying client get bespoke work without a fork. */
  customCss: text("custom_css"),

  ...timestamps,
});

export const contactSettings = pgTable("contact_settings", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),

  addressEn: text("address_en"),
  addressAr: text("address_ar"),
  /** Stored as text to avoid float drift on coordinates. */
  latitude: text("latitude"),
  longitude: text("longitude"),

  phone: text("phone"),
  whatsapp: text("whatsapp"),
  /** { instagram, facebook, tiktok, ... } */
  socials: jsonb("socials")
    .notNull()
    .default(sql`'{}'::jsonb`),

  ...timestamps,
});

/**
 * One row per open segment. Two rows for a split shift (11:00-15:00,
 * 18:00-23:00). A segment where closesAt <= opensAt crosses midnight
 * (18:00-01:00) -- core/contact handles that, and it is unit-tested, because
 * it is the classic bug in every "Open now" badge.
 *
 * No rows for a weekday means closed that day.
 */
export const openingHours = pgTable(
  "opening_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** 0 = Sunday .. 6 = Saturday */
    dayOfWeek: smallint("day_of_week").notNull(),
    opensAt: time("opens_at").notNull(),
    closesAt: time("closes_at").notNull(),

    ...timestamps,
  },
  (table) => [
    index("opening_hours_tenant_day_idx").on(table.tenantId, table.dayOfWeek),
  ],
);

// ─── Relations ────────────────────────────────────────────────────────────

export const tenantsRelations = relations(tenants, ({ many, one }) => ({
  domains: many(domains),
  memberships: many(memberships),
  categories: many(categories),
  items: many(items),
  openingHours: many(openingHours),
  theme: one(themeSettings),
  contact: one(contactSettings),
}));

export const domainsRelations = relations(domains, ({ one }) => ({
  tenant: one(tenants, {
    fields: [domains.tenantId],
    references: [tenants.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  tenant: one(tenants, {
    fields: [memberships.tenantId],
    references: [tenants.id],
  }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [categories.tenantId],
    references: [tenants.id],
  }),
  items: many(items),
}));

export const itemsRelations = relations(items, ({ one, many }) => ({
  tenant: one(tenants, { fields: [items.tenantId], references: [tenants.id] }),
  category: one(categories, {
    fields: [items.categoryId],
    references: [categories.id],
  }),
  image: one(media, { fields: [items.imageId], references: [media.id] }),
  variants: many(itemVariants),
}));

export const itemVariantsRelations = relations(itemVariants, ({ one }) => ({
  item: one(items, { fields: [itemVariants.itemId], references: [items.id] }),
}));

export const mediaRelations = relations(media, ({ one }) => ({
  tenant: one(tenants, { fields: [media.tenantId], references: [tenants.id] }),
}));

export const themeSettingsRelations = relations(themeSettings, ({ one }) => ({
  tenant: one(tenants, {
    fields: [themeSettings.tenantId],
    references: [tenants.id],
  }),
  logo: one(media, { fields: [themeSettings.logoId], references: [media.id] }),
}));

export const contactSettingsRelations = relations(
  contactSettings,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [contactSettings.tenantId],
      references: [tenants.id],
    }),
  }),
);

export const openingHoursRelations = relations(openingHours, ({ one }) => ({
  tenant: one(tenants, {
    fields: [openingHours.tenantId],
    references: [tenants.id],
  }),
}));

/**
 * Tables carrying tenant_id AND protected by RLS. The isolation test asserts
 * every one of them actually has a policy, so adding a table without
 * protecting it fails CI rather than shipping quietly.
 *
 * `domains` and `memberships` also carry tenant_id but are deliberately
 * excluded: both map an outside identifier (a hostname, a user) onto a tenant
 * and must therefore be readable before any tenant context exists. See
 * migration 0003.
 */
export const TENANT_SCOPED_TABLES = [
  "media",
  "categories",
  "items",
  "item_variants",
  "theme_settings",
  "contact_settings",
  "opening_hours",
] as const;

export type TenantScopedTable = (typeof TENANT_SCOPED_TABLES)[number];
