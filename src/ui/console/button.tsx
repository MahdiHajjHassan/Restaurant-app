import type { ButtonHTMLAttributes } from "react";

/**
 * The console's one button.
 *
 * Every screen used to hand-roll its own -- some filled, some bare text, some
 * with a border -- so nothing read as reliably clickable and a change to how
 * buttons look meant editing a dozen files.
 *
 * All native button props pass through untouched, because the console leans on
 * `formAction`, `name`, `value`, `disabled` and `aria-*` in several places and
 * a wrapper that swallowed them would quietly break Server Actions.
 */

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  /** Renders the pending label and disables the control. */
  pending?: boolean;
  pendingLabel?: string;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--c-brand)] text-[var(--c-brand-fg)] border-transparent hover:brightness-110",
  secondary:
    "bg-[var(--c-surface)] text-[var(--c-text)] border-[var(--c-border-strong)] hover:bg-[var(--c-surface-sunk)]",
  danger:
    "bg-[var(--c-surface)] text-[var(--c-danger)] border-[var(--c-danger)] hover:bg-[var(--c-danger-soft)]",
  ghost:
    "bg-transparent text-[var(--c-text-muted)] border-transparent hover:bg-[var(--c-surface-sunk)] hover:text-[var(--c-text)]",
};

/*
 * 44px minimum on the medium size. Owners edit their menu standing in a
 * kitchen, one-handed, and the same reasoning is why reordering is buttons
 * rather than drag.
 */
const SIZES = {
  sm: "min-h-9 px-2.5 py-1.5 text-[0.8rem] gap-1.5",
  md: "min-h-11 px-4 py-2.5 text-[0.9rem] gap-2",
} as const;

export function Button({
  variant = "secondary",
  size = "md",
  pending = false,
  pendingLabel,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled ?? pending}
      className={`inline-flex items-center justify-center rounded-lg border font-medium transition-[background-color,filter] disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
