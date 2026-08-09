"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { IMPERSONATION_COOKIE } from "@/core/auth/impersonation";
import { hashPassword } from "@/core/auth/password";
import { withTenant } from "@/core/db/tenant";
import { createMenuRepository } from "@/core/menu/repository";
import * as platform from "@/core/platform/repository";
import { isValidSlug, normalizeHostname } from "@/core/tenant/hostname";
import { env } from "@/env";
import { requirePlatformAdmin } from "@/server/auth";
import { db } from "@/server/db";
import { platformSubdomain } from "@/server/platform";

/*
 * Operator actions.
 *
 * Every one begins with requirePlatformAdmin. A layout guard does not run for
 * a Server Action invoked directly, and these actions create restaurants and
 * grant logins -- the most privileged operations in the product.
 */

const uuid = z.string().uuid();

export interface OperatorActionState {
  error: string | null;
  saved?: boolean;
  /**
   * Where the client should navigate next. Never redirect() from here: the
   * admin is reached by rewriting app.<platform> onto /admin, and redirect()
   * resolves the path against the app's own route tree, landing on the
   * platform home page. The client calls window.location.assign().
   */
  target?: string;
}

const restaurantInput = z.object({
  name: z.string().trim().min(1, "The restaurant needs a name."),
  slug: z.string().trim().toLowerCase(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .length(3, "Currency must be a 3-letter code like USD or LBP."),
  timezone: z.string().trim().min(1, "Pick a timezone."),
  defaultLocale: z.enum(["en", "ar"]),
  ownerEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("That is not an email address."),
  ownerPassword: z
    .string()
    .min(12, "Give the owner a password of at least 12 characters."),
  exampleMenu: z.boolean(),
});

/** A few dishes, so an owner can be shown something before they supply anything. */
const EXAMPLE_MENU = [
  {
    nameEn: "Starters",
    nameAr: "المقبلات",
    items: [
      { nameEn: "Hummus", nameAr: "حمص", price: 650 },
      { nameEn: "Fattoush", nameAr: "فتوش", price: 800 },
    ],
  },
  {
    nameEn: "Grills",
    nameAr: "المشاوي",
    items: [
      { nameEn: "Chicken Taouk", nameAr: "شيش طاووق", price: 1450 },
      { nameEn: "Lamb Kafta", nameAr: "كفتة", price: 1650 },
    ],
  },
];

export async function createRestaurant(
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  await requirePlatformAdmin();

  const parsed = restaurantInput.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    currency: formData.get("currency"),
    timezone: formData.get("timezone"),
    defaultLocale: formData.get("defaultLocale"),
    ownerEmail: formData.get("ownerEmail"),
    ownerPassword: formData.get("ownerPassword"),
    exampleMenu: formData.get("exampleMenu") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const { slug } = parsed.data;

  /*
   * RESERVED_SLUGS is enforced inside isValidSlug. Handing "app" to a
   * restaurant would put their public site on the admin origin, which is
   * where session cookies live -- their page could then read them.
   */
  if (!isValidSlug(slug)) {
    return {
      error:
        "That web address is not usable. Use lowercase letters, numbers and " +
        "hyphens, and avoid reserved names like app or www.",
    };
  }

  const created = await platform.createRestaurant(db, {
    slug,
    name: parsed.data.name,
    currency: parsed.data.currency,
    timezone: parsed.data.timezone,
    defaultLocale: parsed.data.defaultLocale,
    hostname: platformSubdomain(slug),
    ownerEmail: parsed.data.ownerEmail,
    ownerPasswordHash: await hashPassword(parsed.data.ownerPassword),
  });

  if (!created.ok) {
    return {
      error:
        created.reason === "slug-taken"
          ? "Another restaurant already uses that web address."
          : "That hostname is already taken.",
    };
  }

  /*
   * The example menu is written AFTER the restaurant, in its own transaction.
   * Menu tables are under RLS and need a tenant context, which cannot exist
   * until the tenant does. If this fails the operator has a real restaurant
   * with an empty menu -- visible in the console, and fixable with the
   * quick-add row in seconds.
   */
  if (parsed.data.exampleMenu) {
    await withTenant(db, created.tenantId, async (session) => {
      const repo = createMenuRepository(session);
      // Sequential: these share one transaction, and therefore one connection.
      for (const [index, category] of EXAMPLE_MENU.entries()) {
        const saved = await repo.createCategory({
          nameEn: category.nameEn,
          nameAr: category.nameAr,
          sortOrder: index,
        });
        for (const [position, item] of category.items.entries()) {
          await repo.createItem({
            categoryId: saved.id,
            nameEn: item.nameEn,
            nameAr: item.nameAr,
            basePriceMinor: item.price,
            sortOrder: position,
          });
        }
      }
    });
  }

  revalidatePath("/operator");
  return { error: null, saved: true, target: `/operator/${created.tenantId}` };
}

export async function setRestaurantStatus(
  tenantId: string,
  status: "trial" | "active" | "suspended",
): Promise<OperatorActionState> {
  await requirePlatformAdmin();
  const id = uuid.parse(tenantId);

  const changed = await platform.setRestaurantStatus(db, id, status);
  if (!changed) return { error: "That restaurant no longer exists." };

  revalidatePath(`/operator/${id}`);
  revalidatePath("/operator");
  return { error: null, saved: true };
}

export async function attachDomain(
  tenantId: string,
  _previous: OperatorActionState,
  formData: FormData,
): Promise<OperatorActionState> {
  await requirePlatformAdmin();
  const id = uuid.parse(tenantId);

  const raw = String(formData.get("hostname") ?? "").trim();
  if (!raw) return { error: "Enter a domain name." };

  // Normalised before storage: the Host header arrives with arbitrary casing
  // and possibly a port, and a hostname stored in a second spelling is a
  // restaurant that silently cannot be reached.
  const hostname = normalizeHostname(raw);
  if (!hostname.includes(".")) {
    return { error: "That does not look like a domain name." };
  }

  const attached = await platform.attachDomain(db, id, hostname);
  if (!attached.ok) {
    return { error: "Another restaurant already uses that domain." };
  }

  revalidatePath(`/operator/${id}`);
  return { error: null, saved: true };
}

export async function setDomainVerified(
  tenantId: string,
  domainId: string,
  verified: boolean,
): Promise<OperatorActionState> {
  await requirePlatformAdmin();
  const id = uuid.parse(tenantId);

  const changed = await platform.setDomainVerified(
    db,
    id,
    uuid.parse(domainId),
    verified,
  );
  if (!changed) return { error: "That domain no longer exists." };

  revalidatePath(`/operator/${id}`);
  return { error: null, saved: true };
}

export async function removeDomain(
  tenantId: string,
  domainId: string,
): Promise<OperatorActionState> {
  await requirePlatformAdmin();
  const id = uuid.parse(tenantId);

  const removed = await platform.removeDomain(db, id, uuid.parse(domainId));
  if (!removed.ok) {
    return {
      error:
        "This is the restaurant's only address. Removing it would leave the " +
        "site unreachable, including for its owner.",
    };
  }

  revalidatePath(`/operator/${id}`);
  return { error: null, saved: true };
}

/**
 * Enter a restaurant's admin as its owner sees it.
 *
 * The cookie only names the restaurant. Whether the holder may act as anyone
 * at all is re-decided from `users.is_platform_admin` on every request, so
 * this grants nothing a forged cookie could not already claim and fail with.
 */
export async function startImpersonating(
  tenantId: string,
): Promise<OperatorActionState> {
  await requirePlatformAdmin();
  const id = uuid.parse(tenantId);

  (await cookies()).set(IMPERSONATION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
  });

  return { error: null, saved: true, target: `/${id}` };
}

/*
 * There is deliberately no stopImpersonating action here.
 *
 * Clearing the cookie removes access to the page the caller is standing on,
 * and a Server Action re-renders that page as part of its response -- so the
 * re-render would redirect at the same moment the client tried to navigate,
 * and the two would race. Leaving is a route handler instead: see
 * operator/leave/route.ts.
 */
