const nf = new Intl.NumberFormat("id-ID");

/** 2847 -> "2.847" (pemisah ribuan gaya Indonesia) */
export function fmt(n: number): string {
  return nf.format(n);
}

/** Delta bertanda: +3 / −2 (pakai minus tipografis) */
export function fmtDelta(n: number): string {
  if (n > 0) return `+${nf.format(n)}`;
  if (n < 0) return `−${nf.format(Math.abs(n))}`;
  return "0";
}

/** "Senin, 18 Nov 2024" */
export function fmtDayDate(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** "18 Nov" */
export function fmtShortDate(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(d);
}

export function greetingForHour(hour: number): string {
  if (hour < 5 || hour >= 18) return "Selamat malam";
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  return "Selamat sore";
}

export function greeting(d: Date): string {
  return greetingForHour(d.getUTCHours());
}

/** Inisial produk: "Serum Glow 30ml" -> "SG" */
export function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
