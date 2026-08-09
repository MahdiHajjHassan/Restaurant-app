import { normalizeHostname } from "@/core/tenant/hostname";
import { env } from "@/env";
import { requirePlatformAdmin } from "@/server/auth";
import { CreateRestaurantForm } from "./create-form";

export default async function NewRestaurantPage() {
  await requirePlatformAdmin();

  return (
    <main className="py-6">
      <h1 className="font-display text-lg">New restaurant</h1>
      <p className="mt-2 max-w-prose text-[0.85rem] text-[var(--color-muted)]">
        This creates the restaurant, its web address and the owner&rsquo;s login
        in one step. They can sign in and start adding dishes immediately.
      </p>

      <CreateRestaurantForm
        platformDomain={normalizeHostname(env.PLATFORM_DOMAIN)}
      />
    </main>
  );
}
