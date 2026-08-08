"use client";

import { deleteItem, reorderItems } from "./actions";
import { MoveControls } from "./category-header";
import { ConfirmDelete } from "./confirm-delete";

/**
 * Move and delete, beside the sold-out toggle an owner uses daily.
 *
 * A dish confirms and goes -- one dish is cheap to retype, so the confirmation
 * exists to catch a mis-tap, not to interrogate. A section, which cascades to
 * everything under it, gets a confirmation that names the count instead.
 */
export function ItemRowControls({
  tenantId,
  categoryId,
  itemId,
  itemName,
  orderedIds,
}: {
  tenantId: string;
  categoryId: string;
  itemId: string;
  itemName: string;
  orderedIds: readonly string[];
}) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <MoveControls
        label={itemName}
        orderedIds={orderedIds}
        id={itemId}
        onMove={(ordered) => reorderItems(tenantId, categoryId, ordered)}
      />
      <ConfirmDelete
        label={`Delete ${itemName}`}
        question={`Delete ${itemName}?`}
        onConfirm={() => deleteItem(tenantId, itemId)}
      />
    </span>
  );
}
