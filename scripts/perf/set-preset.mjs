/**
 * Switches the perf-lab tenant between layout presets, so the same 90-dish
 * menu can be measured under each without rebuilding the fixture.
 *
 *   node scripts/perf/set-preset.mjs grid|list|editorial
 *
 * psql is not on PATH on this machine and prompts for a password, so schema
 * pokes during a measurement go through node.
 */
import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local", quiet: true });

const preset = process.argv[2];
if (!["grid", "list", "editorial"].includes(preset ?? "")) {
  console.error("Usage: node scripts/perf/set-preset.mjs grid|list|editorial");
  process.exit(1);
}

const pool = new Pool({
  connectionString:
    process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL,
  max: 1,
});

try {
  const result = await pool.query(
    `UPDATE theme_settings SET preset = $1
     WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'perf-lab')`,
    [preset],
  );
  if (result.rowCount === 0) {
    throw new Error("No perf-lab tenant. Run npm run perf:seed first.");
  }
  console.log(`perf-lab preset -> ${preset}`);
} finally {
  await pool.end();
}
