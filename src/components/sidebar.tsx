"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { fmtDayDate } from "@/lib/format";
import { logoutAction } from "@/app/actions";
import { useDemoStore } from "./demo-store-provider";
import { useToast } from "./toast";
import { Dialog } from "./dialog";
import {
  IconBundle,
  IconChecklist,
  IconDashboard,
  IconLedger,
  IconPackage,
  IconReturn,
  IconTags,
  IconTruck,
} from "./icons";
import { LogoLockup } from "./logo";
import { SidebarCat } from "./sidebar-cat";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  count?: number;
}

function NavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`relative flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] font-medium transition-all duration-150 ${
        active
          ? "bg-white/8 text-white"
          : "text-sidebar-text hover:bg-white/5 hover:text-[#E8EFEB]"
      }`}
    >
      <span
        className={`absolute bottom-1.5 left-0 top-1.5 w-[2px] rounded-full bg-white transition-opacity duration-150 ${
          active ? "opacity-100" : "opacity-0"
        }`}
      />
      {item.icon}
      <span>{item.label}</span>
      {item.count !== undefined ? (
        <span className="ml-auto rounded bg-white/8 px-1.5 py-px font-mono text-[10.5px] text-white">
          {item.count}
        </span>
      ) : null}
    </Link>
  );
}

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { state, backendEnabled, resetDemo, failNextOperation } = useDemoStore();
  const toast = useToast();
  const [resetArmed, setResetArmed] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const anomalies = state.anomalies.filter((item) => item.status === "OPEN");
  const pendingReturns = state.returns.filter((item) => item.inspectionStatus === "PENDING");
  const today = fmtDayDate(new Date(state.demoNow));
  const kritis = anomalies.filter((a) => a.priority === "KRITIS").length;
  const initials = state.actor
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const mainNav: NavItem[] = [
    { href: "/", label: "Worklist Harian", icon: <IconDashboard />, count: anomalies.length },
    { href: "/simulasi", label: "Simulasi Marketplace", icon: <IconPackage /> },
    { href: "/ledger", label: "Stock Ledger", icon: <IconLedger /> },
    { href: "/retur", label: "Penanganan Retur", icon: <IconReturn />, count: pendingReturns.length },
    { href: "/opname", label: "Stok Opname", icon: <IconChecklist /> },
  ];
  const masterNav: NavItem[] = [
    {
      href: "/produk",
      label: "Produk & Batch",
      icon: <IconTags />,
      count: state.products.filter((item) => !item.isBundle).length,
    },
    { href: "/bundle", label: "Resep Bundle", icon: <IconBundle /> },
    { href: "/masuk", label: "Barang Masuk", icon: <IconTruck /> },
  ];

  return (
    <>
      {open ? (
        <button
          aria-label="Tutup menu"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-ink/40 lg:hidden"
        />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[244px] flex-col bg-sidebar transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-5 pb-5 pt-6">
          <LogoLockup />
        </div>

        <div className="flex-1 overflow-y-auto px-3">
          <div className="px-3 pb-3">
            <div className="min-h-[15px] text-[10.5px] text-sidebar-text">{today}</div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#E0A33A]" />
              <span className="text-[11px] font-medium text-[#E0A33A]">
                {anomalies.length} anomali butuh perhatian
              </span>
            </div>
            <div className="mt-0.5 text-[10px] text-sidebar-text">
              {kritis} di antaranya kritis
            </div>
          </div>

          <div className="mb-1.5 px-3 text-[10px] font-medium uppercase tracking-[0.14em] text-sidebar-text">
            Navigasi
          </div>
          <nav className="space-y-0.5">
            {mainNav.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={pathname === item.href}
                onNavigate={onClose}
              />
            ))}
          </nav>

          <div className="mb-1.5 mt-5 px-3 text-[10px] font-medium uppercase tracking-[0.14em] text-sidebar-text">
            Master
          </div>
          <nav className="space-y-0.5 pb-4">
            {masterNav.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={pathname === item.href}
                onNavigate={onClose}
              />
            ))}
          </nav>
        </div>

        <div className="border-t border-white/8 px-4 py-3">
          {!backendEnabled ? <div className="mb-3 grid grid-cols-2 gap-1.5">
            <button
              onClick={() => {
                if (!resetArmed) {
                  setResetArmed(true);
                  return;
                }
                resetDemo();
                setResetArmed(false);
                toast({ title: "Demo direset", description: "Semua data kembali ke seed awal." });
              }}
              onBlur={() => setResetArmed(false)}
              className={`min-h-11 rounded-md border px-2 text-[10.5px] font-medium ${
                resetArmed
                  ? "border-[#E0A33A] bg-[#E0A33A]/15 text-[#F2C169]"
                  : "border-white/10 text-sidebar-text hover:bg-white/5"
              }`}
            >
              {resetArmed ? "Klik lagi reset" : "Reset Demo"}
            </button>
            <button
              onClick={() => {
                failNextOperation();
                toast({
                  title: "Failure state aktif",
                  description: "Operasi permanen berikutnya akan gagal tanpa mutasi data.",
                  tone: "info",
                });
              }}
              className="min-h-11 rounded-md border border-white/10 px-2 text-[10.5px] font-medium text-sidebar-text hover:bg-white/5"
            >
              Gagalkan berikutnya
            </button>
          </div> : null}
          <SidebarCat fallbackHour={new Date(state.demoNow).getUTCHours()} />
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-2 text-[12px] font-medium text-[#E8EFEB]">
              {initials || "A"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-medium text-white">
                {state.actor}
              </div>
              <div className="truncate text-[10px] text-sidebar-text">
                Akses Penuh · Admin
              </div>
            </div>
            {backendEnabled ? (
              <>
                <button onClick={() => setLogoutOpen(true)} className="min-h-11 rounded-md border border-white/10 px-3 text-[10.5px] font-medium text-sidebar-text hover:bg-white/5">
                  Keluar
                </button>
                <Dialog
                  open={logoutOpen}
                  onClose={() => setLogoutOpen(false)}
                  title="Konfirmasi Keluar"
                  description="Apakah Anda yakin ingin keluar dari sistem? Anda harus login kembali untuk melanjutkan."
                  size="sm"
                >
                  <div className="flex justify-end gap-3 border-t border-line-2 bg-surface p-4">
                    <button
                      onClick={() => setLogoutOpen(false)}
                      className="min-h-[40px] rounded-lg border border-line bg-white px-5 text-[12.5px] font-semibold text-ink transition-all hover:bg-line-2"
                    >
                      Batal
                    </button>
                    <form action={logoutAction}>
                      <button className="min-h-[40px] rounded-lg bg-[#dc2626] px-5 text-[12.5px] font-semibold text-white shadow-[0_4px_14px_rgba(220,38,38,0.25)] transition-all hover:bg-[#b91c1c]">
                        Ya, Keluar
                      </button>
                    </form>
                  </div>
                </Dialog>
              </>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}
