"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IconAlert, IconCheck, IconInfo } from "./icons";

interface ToastData {
  title: string;
  description: string;
  tone?: "success" | "error" | "info";
}

const ToastContext = createContext<(t: ToastData) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((t: ToastData) => {
    setToast(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <div className="fixed bottom-5 right-5 z-50">
          <div
            role="status"
            className="animate-toast-in flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-[0_8px_24px_-8px_rgba(22,32,27,0.18)]"
          >
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-md ${
                toast.tone === "error"
                  ? "bg-red-soft text-red"
                  : toast.tone === "info"
                    ? "bg-amber-soft text-amber"
                    : "bg-green-soft text-green"
              }`}
            >
              {toast.tone === "error" ? (
                <IconAlert size={14} />
              ) : toast.tone === "info" ? (
                <IconInfo size={14} />
              ) : (
                <IconCheck size={14} />
              )}
            </div>
            <div>
              <div className="text-[12.5px] font-medium">{toast.title}</div>
              <div className="text-[11px] text-muted">{toast.description}</div>
            </div>
          </div>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}
