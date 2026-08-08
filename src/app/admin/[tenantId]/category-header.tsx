"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteCategory,
  reorderCategories,
  updateCategory,
  type MenuActionState,
} from "./actions";
import { ConfirmDelete } from "./confirm-delete";

const ghost =
  "rounded-md border border-[var(--color-rule)] px-2 py-1 text-[0.75rem] text-[var(--color-muted)] hover:text-[var(--color-ink)] disabled:opacity-40";

const field =
  "rounded-md border border-[var(--color-rule)] bg-transparent px-2 py-1 text-[0.9rem]";

/**
 * Reorder by buttons, not by drag.
 *
 * The roadmap asked for drag. Drag is fine on a laptop and genuinely bad on a
 * phone: a long list, one thumb, and a scroll gesture competing with the drag.
 * This admin is used standing in a kitchen, so the mobile experience wins.
 * Buttons also work from a keyboard and are announced by screen readers.
 *
 * The FULL ordered list goes to the server, never a "move up" delta: two open
 * tabs each sending a swap can interleave into an order neither owner asked
 * for, whereas the last full list to land is at least coherent.
 */
export function MoveControls({
  label,
  orderedIds,
  id,
  onMove,
}: {
  /** Names the thing being moved, e.g. "Grills". */
  label: string;
  orderedIds: readonly string[];
  id: string;
  onMove: (ordered: string[]) => Promise<MenuActionState>;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const index = orderedIds.indexOf(id);
  const first = index <= 0;
  const last = index === orderedIds.length - 1;

  function move(delta: -1 | 1) {
    const next = [...orderedIds];
    const target = index + delta;
    const moved = next[index];
    const displaced = next[target];
    if (moved === undefined || displaced === undefined) return;
    next[index] = displaced;
    next[target] = moved;

    startTransition(async () => {
      await onMove(next);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        aria-label={`Move ${label} up`}
        disabled={pending || first}
        onClick={() => move(-1)}
        className={ghost}
      >
        ↑
      </button>
      <button
        type="button"
        aria-label={`Move ${label} down`}
        disabled={pending || last}
        onClick={() => move(1)}
        className={ghost}
      >
        ↓
      </button>
    </>
  );
}

export function CategoryHeader({
  tenantId,
  categoryId,
  nameEn,
  nameAr,
  isVisible,
  itemCount,
  orderedIds,
}: {
  tenantId: string;
  categoryId: string;
  nameEn: string;
  nameAr: string | null;
  isVisible: boolean;
  itemCount: number;
  orderedIds: readonly string[];
}) {
  const [renaming, setRenaming] = useState(false);
  const [draftEn, setDraftEn] = useState(nameEn);
  const [draftAr, setDraftAr] = useState(nameAr ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    startTransition(async () => {
      const result = await updateCategory(tenantId, categoryId, {
        nameEn: draftEn,
        nameAr: draftAr,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setRenaming(false);
      router.refresh();
    });
  }

  function toggleVisible() {
    startTransition(async () => {
      const result = await updateCategory(tenantId, categoryId, {
        isVisible: !isVisible,
      });
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  if (renaming) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          value={draftEn}
          onChange={(event) => setDraftEn(event.target.value)}
          aria-label={`Section name for ${nameEn}`}
          required
          autoFocus
          className={field}
        />
        <input
          value={draftAr}
          onChange={(event) => setDraftAr(event.target.value)}
          aria-label={`Arabic name for ${nameEn}`}
          dir="rtl"
          className={field}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-[0.8rem] text-[var(--color-on-accent)] disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setDraftEn(nameEn);
            setDraftAr(nameAr ?? "");
            setRenaming(false);
          }}
          className={ghost}
        >
          Cancel
        </button>
        {error ? (
          <p role="alert" className="basis-full text-[0.8rem]">
            {error}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="flex min-w-0 flex-1 items-baseline gap-2 font-display text-base">
        <span className="truncate">{nameEn}</span>
        {nameAr ? (
          <span
            dir="rtl"
            className="truncate text-[0.8rem] text-[var(--color-muted)]"
          >
            {nameAr}
          </span>
        ) : null}
        {!isVisible ? (
          <span className="shrink-0 rounded-sm border border-[var(--color-rule)] px-1.5 py-0.5 text-[0.65rem] tracking-wide text-[var(--color-muted)] uppercase">
            Hidden
          </span>
        ) : null}
      </h2>

      <span className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          aria-label={`Rename ${nameEn}`}
          onClick={() => setRenaming(true)}
          className={ghost}
        >
          Rename
        </button>
        <button
          type="button"
          aria-label={isVisible ? `Hide ${nameEn}` : `Show ${nameEn}`}
          disabled={pending}
          onClick={toggleVisible}
          className={ghost}
        >
          {isVisible ? "Hide" : "Show"}
        </button>
        <MoveControls
          label={nameEn}
          orderedIds={orderedIds}
          id={categoryId}
          onMove={(ordered) => reorderCategories(tenantId, ordered)}
        />
        <ConfirmDelete
          label={`Delete ${nameEn}`}
          question={
            itemCount === 0
              ? `Delete ${nameEn}?`
              : `Delete ${nameEn} and its ${itemCount} ${
                  itemCount === 1 ? "dish" : "dishes"
                }?`
          }
          onConfirm={() => deleteCategory(tenantId, categoryId)}
        />
      </span>

      {error ? (
        <p role="alert" className="basis-full text-[0.8rem]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
