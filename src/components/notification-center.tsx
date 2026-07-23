"use client";

import Link from "next/link";
import { useDemoStore } from "./demo-store-provider";
import { Dialog } from "./dialog";
import { EmptyState, PillRect } from "./ui";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function NotificationCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, execute } = useDemoStore();
  const unread = state.notifications.filter((item) => !item.readAt).length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Notifikasi"
      description={`${unread} belum dibaca · expiry batch dan deadline klaim TikTok`}
    >
      <div className="flex items-center justify-end border-b border-line-2 px-5 py-2.5">
        <button
          onClick={() => void execute({ type: "MARK_ALL_NOTIFICATIONS_READ" })}
          disabled={unread === 0}
          className="min-h-11 text-[12px] font-medium text-green disabled:text-muted-2"
        >
          Tandai semua dibaca
        </button>
      </div>
      {state.notifications.length === 0 ? (
        <EmptyState title="Tidak ada notifikasi" description="Rekonsiliasi belum menemukan expiry atau deadline klaim." />
      ) : (
        <div className="divide-y divide-line-2">
          {state.notifications.map((notification) => (
            <Link
              key={notification.id}
              href={notification.target}
              onClick={() => {
                void execute({ type: "MARK_NOTIFICATION_READ", notificationId: notification.id });
                onClose();
              }}
              className={`block px-5 py-4 transition-colors hover:bg-line-2 ${notification.readAt ? "opacity-65" : "bg-green-soft/35"}`}
            >
              <div className="flex items-start gap-3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.readAt ? "bg-line" : "bg-red"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12.5px] font-medium">{notification.title}</span>
                    <PillRect tone={notification.type === "TIKTOK_CLAIM" ? "red" : "amber"}>
                      {notification.type === "TIKTOK_CLAIM" ? "KLAIM" : "EXPIRY"}
                    </PillRect>
                  </div>
                  <p className="mt-1 text-[11.5px] text-muted">{notification.description}</p>
                  <p className="mt-1 font-mono text-[10px] text-muted-2">{formatTime(notification.createdAt)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Dialog>
  );
}
