/**
 * Logo "Jejak" — tiga baris ledger; baris terakhir berhenti lalu dilanjutkan
 * titik jejak (trace). Motif: setiap angka stok meninggalkan jejak.
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="jejak-tile" x1="0" y1="0" x2="48" y2="48">
          <stop offset="0" stopColor="#2C4A3B" />
          <stop offset="1" stopColor="#17352A" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="11" fill="url(#jejak-tile)" />
      <rect
        width="47"
        height="47"
        x="0.5"
        y="0.5"
        rx="10.5"
        stroke="#FFFFFF"
        strokeOpacity="0.12"
        fill="none"
      />
      <g strokeLinecap="round">
        <path d="M13 17h22" stroke="#E8EFEB" strokeWidth="3" />
        <path d="M13 24h22" stroke="#E8EFEB" strokeWidth="3" />
        <path d="M13 31h12" stroke="#E8EFEB" strokeWidth="3" />
      </g>
      <circle cx="31.5" cy="31" r="3.2" fill="#E9B44C" />
      <circle cx="38" cy="31" r="1.6" fill="#E9B44C" opacity="0.45" />
    </svg>
  );
}

export function LogoLockup({ textColor = "light" }: { textColor?: "light" | "dark" }) {
  const isDarkText = textColor === "dark";
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={34} />
      <div>
        <div className={`text-[15.5px] font-semibold leading-none tracking-tight ${isDarkText ? "text-ink" : "text-white"}`}>
          Jejak
        </div>
        <div className={`mt-1 text-[9.5px] font-medium uppercase tracking-[0.16em] ${isDarkText ? "text-muted" : "text-sidebar-text"}`}>
          Rekonsiliasi Stok
        </div>
      </div>
    </div>
  );
}
