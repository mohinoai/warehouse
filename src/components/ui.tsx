import type { HTMLAttributes, ReactNode } from "react";

function cx(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx("rounded-lg border border-line bg-surface", className)}
      {...props}
    />
  );
}

type Tone = "green" | "amber" | "red" | "neutral" | "ghost";

const pillTone: Record<Tone, string> = {
  green: "bg-green-soft text-green",
  amber: "bg-amber-soft text-amber",
  red: "bg-red-soft text-red",
  neutral: "bg-line-2 text-ink-2",
  ghost: "bg-line-2 text-muted",
};

export function Pill({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-[5px] rounded-full px-2 py-[2px] text-[11px] font-medium leading-[1.4]",
        pillTone[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Pill kotak monospace — untuk kode reason/batch/status. */
export function PillRect({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-[5px] rounded px-[7px] py-[2px] font-mono text-[10.5px] font-medium tracking-[0.02em]",
        pillTone[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
        className,
      )}
    />
  );
}

export function SectionLabel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  valueClassName,
  suffix,
  badge,
  foot,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  suffix?: ReactNode;
  badge?: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-1.5 flex items-baseline gap-2">
        <div
          className={cx(
            "font-mono text-[30px] font-medium leading-none tabular-nums",
            valueClassName,
          )}
        >
          {value}
          {suffix}
        </div>
        {badge}
      </div>
      {foot ? (
        <div className="mt-3 flex items-center gap-1.5 text-[11.5px]">
          {foot}
        </div>
      ) : null}
    </Card>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-12 text-center">
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--muted-2)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 6h16M4 12h16M4 18h6" />
        <circle cx="19" cy="18" r="2.4" />
      </svg>
      <div className="mt-1 text-[13px] font-medium">{title}</div>
      {description ? (
        <p className="max-w-sm text-[11.5px] leading-relaxed text-muted">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cx("animate-pulse rounded-md bg-line-2", className)} />
  );
}

export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 border-t border-line-2 px-4 py-3 text-[11.5px] text-muted">
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="mt-0.5 shrink-0"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" />
      </svg>
      <span>{children}</span>
    </div>
  );
}
