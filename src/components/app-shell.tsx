"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { DemoState } from "@/lib/demo/types";
import { Sidebar } from "./sidebar";
import { TopBar } from "./topbar";
import { ToastProvider } from "./toast";
import { DemoStoreProvider } from "./demo-store-provider";

export function AppShell({
  children,
  initialState,
  backendEnabled,
}: {
  children: ReactNode;
  initialState: DemoState;
  backendEnabled: boolean;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (pathname === "/login") return children;

  return (
    <DemoStoreProvider initialState={initialState} backendEnabled={backendEnabled}>
      <ToastProvider>
        <div className="h-dvh overflow-hidden lg:pl-[244px]">
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <main id="main-content" className="h-dvh min-w-0 overflow-y-auto overscroll-contain">
            <TopBar onMenu={() => setSidebarOpen(true)} />
            {children}
          </main>
        </div>
      </ToastProvider>
    </DemoStoreProvider>
  );
}
