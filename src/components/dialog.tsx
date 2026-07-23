"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconClose } from "./icons";

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const width = size === "lg" ? "max-w-3xl" : size === "sm" ? "max-w-sm" : "max-w-lg";

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={`m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] ${width} overflow-hidden rounded-xl border border-line bg-surface p-0 text-ink shadow-[0_22px_70px_-20px_rgba(22,32,27,0.42)] backdrop:bg-ink/45 open:animate-toast-in`}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex shrink-0 items-start gap-4 border-b border-line-2 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[15px] font-semibold">
              {title}
            </h2>
            <p id={descriptionId} className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted transition-colors hover:bg-line-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green"
          >
            <IconClose size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </dialog>
  );
}
