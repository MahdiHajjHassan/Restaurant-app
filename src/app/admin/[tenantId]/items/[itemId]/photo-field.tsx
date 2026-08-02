"use client";

import Image from "next/image";
import { useActionState, useRef, useState } from "react";
import { uploadItemPhoto, type PhotoFormState } from "./photo-actions";

interface PhotoFieldProps {
  tenantId: string;
  itemId: string;
  dishName: string;
  currentImage: { storageKey: string; blurDataUrl: string | null } | null;
}

const initialState: PhotoFormState = { error: null };

/**
 * Dish photo upload.
 *
 * Deliberately its own form rather than a field inside the item form: an owner
 * standing in a kitchen photographs one dish and wants it up immediately,
 * without also re-submitting the name, description and price.
 */
export function PhotoField({
  tenantId,
  itemId,
  dishName,
  currentImage,
}: PhotoFieldProps) {
  const upload = uploadItemPhoto.bind(null, tenantId, itemId);
  const [state, formAction, pending] = useActionState(upload, initialState);

  const formRef = useRef<HTMLFormElement>(null);
  const removeRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="mt-6 border-t border-[var(--color-rule)] pt-5"
    >
      <p className="text-[0.85rem] font-medium">Photo</p>

      <div className="mt-2 flex items-start gap-3">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-[var(--color-paper-sunk)]">
          {preview ? (
            // Local object URL, so the owner sees their photo before it uploads.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : currentImage ? (
            <Image
              src={`/storage/${currentImage.storageKey}`}
              alt={`Current photo of ${dishName}`}
              fill
              sizes="80px"
              placeholder={currentImage.blurDataUrl ? "blur" : "empty"}
              blurDataURL={currentImage.blurDataUrl ?? undefined}
              className="object-cover"
            />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <input type="hidden" name="remove" ref={removeRef} value="false" />
          <input
            type="file"
            name="photo"
            // Narrows the phone's picker. The real check is the magic-byte
            // sniff on the server -- this attribute is a convenience, and it is
            // trivially bypassed.
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              setPreview(file ? URL.createObjectURL(file) : null);
              // Submit on pick: one tap in a kitchen, not two.
              if (file) formRef.current?.requestSubmit();
            }}
            className="block w-full text-[0.8rem] file:me-3 file:rounded-md file:border file:border-[var(--color-rule)] file:bg-transparent file:px-3 file:py-1.5 file:text-[0.8rem] file:text-[var(--color-ink)]"
          />

          <p className="mt-1.5 text-[0.75rem] text-[var(--color-muted)]">
            JPEG, PNG or WebP, up to 8 MB. Location data is removed
            automatically.
          </p>

          {currentImage && !pending ? (
            <button
              type="submit"
              onClick={() => {
                if (removeRef.current) removeRef.current.value = "true";
                setPreview(null);
              }}
              className="mt-2 text-[0.78rem] text-[var(--color-accent)] underline"
            >
              Remove photo
            </button>
          ) : null}
        </div>
      </div>

      {pending ? (
        <p role="status" className="mt-2 text-[0.8rem] text-[var(--color-muted)]">
          Uploading…
        </p>
      ) : null}

      {state.error ? (
        <p
          role="alert"
          className="mt-2 rounded-md border border-[var(--color-rule)] px-3 py-2 text-[0.85rem]"
        >
          {state.error}
        </p>
      ) : null}

      {state.saved && !pending ? (
        <p role="status" className="mt-2 text-[0.85rem] text-[var(--color-accent)]">
          Photo saved. It is on your site now.
        </p>
      ) : null}
    </form>
  );
}
