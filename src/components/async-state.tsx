import type { ReactNode } from "react";
import { Card, EmptyState, Skeleton } from "./ui";

export function LoadingRows({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3 p-4" role="status" aria-label="Memuat data">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-14" />
      ))}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card>
      <EmptyState
        title="Data gagal dimuat"
        description={message}
        action={
          <button
            onClick={onRetry}
            className="min-h-11 rounded-md bg-ink px-4 text-[12px] font-medium text-white"
          >
            Coba lagi
          </button>
        }
      />
    </Card>
  );
}

export function SuccessPanel({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="rounded-md border border-green/20 bg-green-soft px-3 py-2.5 text-[12px] text-green">
      {children}
    </div>
  );
}
