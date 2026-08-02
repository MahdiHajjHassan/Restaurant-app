import { cache } from "react";
import { withTenant } from "@/core/db/tenant";
import {
  createMenuRepository,
  type Category,
  type MenuItem,
} from "@/core/menu/repository";
import { db } from "./db";

export interface AdminCategory extends Category {
  items: MenuItem[];
}

/**
 * The menu as the OWNER sees it.
 *
 * Unlike the public view this keeps hidden categories and empty ones: the
 * owner needs to see and fix exactly the things a customer must not see.
 */
export const getAdminMenu = cache(
  async (tenantId: string): Promise<AdminCategory[]> => {
    return withTenant(db, tenantId, async (session) => {
      const repo = createMenuRepository(session);

      // Sequential: these share one transaction, and therefore one connection.
      const categories = await repo.listCategories();
      const items = await repo.listItems();

      const byCategory = new Map<string, MenuItem[]>();
      for (const item of items) {
        const list = byCategory.get(item.categoryId);
        // The admin list shows names, prices and the sold-out toggle; it does
        // not render photos or variants, so neither is loaded here.
        const entry: MenuItem = { ...item, variants: [], image: null };
        if (list) list.push(entry);
        else byCategory.set(item.categoryId, [entry]);
      }

      return categories.map((category) => ({
        ...category,
        items: byCategory.get(category.id) ?? [],
      }));
    });
  },
);
