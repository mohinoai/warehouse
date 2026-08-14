"use client";

import type { ReactNode } from "react";
import { useState, useRef, useEffect } from "react";

function cx(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function CustomSelect({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((o) => o.value === value) || options[0];

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cx(
          className,
          "flex items-center justify-between text-left outline-none",
          open && "ring-[3px] ring-[#6cc795]/20 border-[#6cc795] bg-white"
        )}
      >
        <span className="truncate">{selectedOption?.label}</span>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20" className={cx("ml-2 h-[1.2rem] w-[1.2rem] shrink-0 transition-transform duration-200", open ? "rotate-180 text-[#1f6b43]" : "text-muted-2")}>
          <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="m6 8 4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1.5 max-h-64 w-full overflow-auto rounded-[0.85rem] border border-black/[0.08] bg-white py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.12)] animate-fade-in">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cx(
                "flex w-full items-center px-4 py-2.5 text-left text-[12.5px] transition-colors",
                option.value === value ? "bg-[#e6f2ec] text-[#1f6b43] font-semibold" : "text-ink hover:bg-black/[0.03]"
              )}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span className="truncate">{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
