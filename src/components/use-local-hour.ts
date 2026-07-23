"use client";

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);

  if (!timer) {
    timer = setInterval(() => {
      listeners.forEach((notify) => notify());
    }, 60_000);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

function getLocalHour() {
  return new Date().getHours();
}

export function useLocalHour(fallbackHour: number) {
  return useSyncExternalStore(subscribe, getLocalHour, () => fallbackHour);
}
