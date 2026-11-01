import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { currentTheme, toggleTheme } from "../lib/theme";
import { AlertIcon, MoonIcon, SpinnerIcon, SunIcon } from "./icons";

/** Join conditional class names. */
export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ button */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonVariants: Record<ButtonVariant, string> = {
  // Inverted primary — the Vercel/T3 signature: dark-on-light, light-on-dark.
  primary:
    "bg-btn-primary-bg text-btn-primary-ink hover:bg-btn-primary-bg-hover disabled:hover:bg-btn-primary-bg",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  loading?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-9 px-3.5 text-[13px]",
        buttonVariants[variant],
        className,
      )}
      {...rest}
    >
      {loading && <SpinnerIcon className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------- card */

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cx("rounded-lg border border-line bg-surface", className)}
    >
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------- field */

export const controlCls =
  "h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 text-[13px] text-ink " +
  "placeholder:text-ink-2/60 transition-colors focus:border-accent focus:outline-none " +
  "focus:ring-2 focus:ring-accent/20 disabled:opacity-50";

/** Label + control + optional hint. Wraps the control so the label names it
 * for assistive tech (and tests) without extra ids. */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block text-[13px] font-medium text-ink", className)}>
      {label}
      <div className="mt-1.5">{children}</div>
      {hint && (
        <span className="mt-1 block text-xs font-normal text-ink-2">
          {hint}
        </span>
      )}
    </label>
  );
}

/* ------------------------------------------------------------------- badge */

/** A small status dot plus quiet text — color carries meaning, not surface. */
export function DotBadge({
  color,
  children,
  title,
  className,
}: {
  /** Theme color token name, e.g. "st-offer" or "kind-skill". */
  color: string;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1.5 text-xs whitespace-nowrap",
        className,
      )}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: `var(--${color})` }}
      />
      {children}
    </span>
  );
}

const STATUS_TOKEN: Record<string, string> = {
  wishlist: "st-wishlist",
  applied: "st-applied",
  oa: "st-oa",
  interview: "st-interview",
  offer: "st-offer",
  rejected: "st-rejected",
};

const KIND_TOKEN: Record<string, string> = {
  skill: "kind-skill",
  experience: "kind-experience",
  project: "kind-project",
  achievement: "kind-achievement",
  education: "kind-education",
  certification: "kind-certification",
};

export function StatusBadge({
  status,
  count,
}: {
  status: string;
  count?: number;
}) {
  return (
    <DotBadge color={STATUS_TOKEN[status] ?? "st-wishlist"}>
      {count === undefined ? status : `${status} ${count}`}
    </DotBadge>
  );
}

export function KindBadge({ kind }: { kind: string }) {
  return <DotBadge color={KIND_TOKEN[kind] ?? "st-wishlist"}>{kind}</DotBadge>;
}

/* ------------------------------------------------------------------- alert */

export function Alert({
  tone = "danger",
  role,
  title,
  children,
  className,
}: {
  tone?: "danger" | "review" | "ok";
  role?: string;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const colorToken =
    tone === "danger" ? "danger" : tone === "review" ? "review" : "ok";
  return (
    <div
      role={role}
      className={cx(
        "flex items-start gap-2.5 rounded-md border p-3 text-[13px]",
        className,
      )}
      style={{
        color: `var(--${colorToken})`,
        borderColor: `color-mix(in oklab, var(--${colorToken}) 30%, transparent)`,
        background: `color-mix(in oklab, var(--${colorToken}) 7%, transparent)`,
      }}
    >
      {tone !== "ok" && <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- skeletons */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} aria-hidden />;
}

/** Suspense fallback for lazy route chunks. */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3.5 w-72" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-36 rounded-lg" />
    </div>
  );
}

/* -------------------------------------------------------------- empty state */

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong p-10 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && (
        <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-2">
          {children}
        </p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/* --------------------------------------------------------------- page head */

export function PageHeader({
  title,
  lede,
  actions,
}: {
  title: string;
  lede?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight text-ink">
          {title}
        </h1>
        {lede && <p className="mt-0.5 text-[13px] text-ink-2">{lede}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ theme toggle */

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState(currentTheme);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => setTheme(toggleTheme())}
      className={cx(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink",
        className,
      )}
    >
      {theme === "dark" ? (
        <SunIcon className="h-4 w-4" />
      ) : (
        <MoonIcon className="h-4 w-4" />
      )}
    </button>
  );
}
