import { normalizeHostname } from "@/core/tenant/hostname";
import { env } from "@/env";
import { requirePlatformAdmin } from "@/server/auth";
import { PageHeader } from "@/ui/console";
import { CreateRestaurantForm } from "./create-form";

export default async function NewRestaurantPage() {
  await requirePlatformAdmin();

  return (
    <main>
      <PageHeader
        title="New restaurant"
        description="This creates the restaurant, its web address and the owner’s login in one step. They can sign in and start adding dishes immediately."
      />

      <CreateRestaurantForm
        platformDomain={normalizeHostname(env.PLATFORM_DOMAIN)}
      />
    </main>
  );
}
