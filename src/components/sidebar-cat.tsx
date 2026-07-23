"use client";

import { useEffect, useRef } from "react";
import type { DotLottie } from "@lottiefiles/dotlottie-web";
import { greetingForHour } from "@/lib/format";
import { useLocalHour } from "./use-local-hour";

export function SidebarCat({ fallbackHour }: { fallbackHour: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const localHour = useLocalHour(fallbackHour);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;
    let player: DotLottie | undefined;

    function handleMotionChange(event: MediaQueryListEvent) {
      if (event.matches) player?.pause();
      else player?.play();
    }

    motionQuery.addEventListener("change", handleMotionChange);

    void import("@lottiefiles/dotlottie-web").then(({ DotLottie }) => {
      if (disposed) return;

      player = new DotLottie({
        canvas,
        src: "/black-cat.json",
        autoplay: !motionQuery.matches,
        loop: true,
        segment: [0, 178],
        renderConfig: {
          autoResize: true,
          freezeOnOffscreen: true,
        },
      });
    });

    return () => {
      disposed = true;
      motionQuery.removeEventListener("change", handleMotionChange);
      player?.destroy();
    };
  }, []);

  return (
    <div className="mx-auto mb-3 w-full max-w-[212px]">
      <div
        role="status"
        className="relative mb-2 rounded-xl bg-[#F7F8F6] px-3 py-2 text-[#243129] shadow-[0_8px_20px_-14px_rgba(0,0,0,0.7)]"
      >
        <span className="block text-[10.5px] font-medium leading-snug">
          Meong! {greetingForHour(localHour)}, Kak.
        </span>
        <span className="mt-0.5 block text-[9.5px] leading-snug text-[#68736C]">
          Semangat hari ini, kamu pasti bisa!
        </span>
        <span
          aria-hidden="true"
          className="absolute -bottom-1.5 left-8 h-3 w-3 rotate-45 bg-[#F7F8F6]"
        />
      </div>
      <div
        aria-hidden="true"
        className="aspect-[1495/805] w-full overflow-hidden rounded-[22px] border border-white/10 bg-white p-1.5 shadow-[0_10px_24px_-16px_rgba(0,0,0,0.55)]"
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
      </div>
    </div>
  );
}
