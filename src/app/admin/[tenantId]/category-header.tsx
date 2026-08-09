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

/*
 * 44px tall even though these read as small controls. Every one of them is a
 * tap target on a phone held in one hand in a kitchen, and a 24px button there
 * is a mis-tap that deletes a section.
 */
const ghost =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-transparent px-2.5 text-[0.8rem] font-medium text-[var(--c-text-muted)] hover:bg-[var(--c-surface-sunk)] hover:text-[var(--c-text)] disabled:opacity-35 disabled:hover:bg-transparent";

const field =
  "min-h-11 rounded-lg border border-[var(--c-border-strong)] bg-[var(--c-surface)] px-3 py-2 text-[0.9rem]";

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
          className="min-h-11 rounded-lg bg-[var(--c-brand)] px-4 text-[0.85rem] font-medium text-[var(--c-brand-fg)] disabled:opacity-55"
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
          <p
            role="alert"
            className="basis-full text-[0.8rem] text-[var(--c-danger)]"
          >
            {error}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* basis-full on a phone for the same reason the dish name takes its own
          row: six controls beside it leave nothing for the section's name. */}
      <h2 className="flex min-w-0 flex-1 basis-full items-baseline gap-2 text-[1rem] font-semibold sm:basis-auto">
        <span className="truncate">{nameEn}</span>
        {nameAr ? (
          <span
            dir="rtl"
            className="truncate text-[0.825rem] font-normal text-[var(--c-text-muted)]"
          >
            {nameAr}
          </span>
        ) : null}
        {!isVisible ? (
          // A hidden section is a state, not a fault: the owner chose it, and
          // the spine on the panel says the same thing more quietly.
          <span className="shrink-0 rounded-full bg-[var(--c-surface-sunk)] px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-[var(--c-text-muted)] uppercase">
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
