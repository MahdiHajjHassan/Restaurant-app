import { z } from "zod";

/**
 * Validated server environment.
 *
 * This lives OUTSIDE src/core on purpose. `core` never reads process.env --
 * it exposes factories that receive their configuration, which is what lets
 * the future React Native app import the same modules and supply config from
 * its own environment. Reading the environment is a composition-root job.
 *
 * Failing loudly at startup beats a `undefined` connection string surfacing as
 * a confusing runtime error three layers deep.
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  MIGRATION_DATABASE_URL: z.string().min(1).optional(),

  PLATFORM_DOMAIN: z.string().min(1, "PLATFORM_DOMAIN is required"),

  STORAGE_DRIVER: z.enum(["local", "r2"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

function loadServerEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Invalid environment configuration:\n${issues}\n\n` +
        `Copy .env.example to .env.local and fill it in.`,
    );
  }

  return parsed.data;
}

export const env: ServerEnv = loadServerEnv();
