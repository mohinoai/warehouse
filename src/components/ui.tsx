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
      className={cx("rounded-[1.25rem] border border-black/[0.06] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.03)]", className)}
      {...props}
    />
  );
}

type Tone = "green" | "amber" | "red" | "neutral" | "ghost";

const pillTone: Record<Tone, string> = {
  green: "bg-[#e6f2ec] text-[#1f6b43]",
  amber: "bg-[#fbf1dd] text-[#b07012]",
  red: "bg-[#fbe7e3] text-[#c0392b]",
  neutral: "bg-black/[0.04] text-ink-2",
  ghost: "bg-transparent text-muted",
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
        "inline-flex items-center gap-[5px] rounded-full px-2.5 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.04em]",
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
        "inline-flex items-center gap-[5px] rounded-md px-2 py-[3px] font-mono text-[10px] font-medium tracking-wide",
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
        "inline-block h-[7px] w-[7px] shrink-0 rounded-full shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]",
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
        "text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#75867d]",
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
    <Card className="p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(0,0,0,0.06)] group">
      <SectionLabel className="group-hover:text-green transition-colors duration-300">{label}</SectionLabel>
      <div className="mt-3 flex items-baseline gap-2.5">
        <div
          className={cx(
            "font-mono text-[34px] font-semibold leading-none tracking-tight text-ink",
            valueClassName,
          )}
        >
          {value}
          {suffix}
        </div>
        {badge && <div className="ml-1">{badge}</div>}
      </div>
      {foot ? (
        <div className="mt-4 flex items-center gap-1.5 text-[11px] font-medium text-muted-2">
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
