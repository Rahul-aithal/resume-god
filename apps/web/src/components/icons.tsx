import type { SVGProps } from "react";

/* Hand-rolled 24px stroke icons — a few hundred bytes instead of an icon
 * library. All inherit color via currentColor. */

function Svg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    />
  );
}

/** Brand mark: three connected nodes — the knowledge graph. */
export function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path
        d="M7 17.5 16.5 19M7.5 6.5 17 5.2M8 12h8"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <circle cx="6" cy="6" r="2.6" fill="var(--kind-skill)" />
      <circle cx="6" cy="18" r="2.6" fill="var(--kind-experience)" />
      <circle cx="18" cy="12" r="2.6" fill="var(--kind-project)" />
    </svg>
  );
}

export function DashboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
    </Svg>
  );
}

export function NewJobIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M14 3.5H7a1.8 1.8 0 0 0-1.8 1.8v13.4A1.8 1.8 0 0 0 7 20.5h10a1.8 1.8 0 0 0 1.8-1.8V8.3Z" />
      <path d="M14 3.5V8.3h4.8" />
      <path d="M12 11.5v5M9.5 14h5" />
    </Svg>
  );
}

export function ReviewIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M12 3.2 5 5.8v5.4c0 4.3 2.9 7.6 7 9.6 4.1-2 7-5.3 7-9.6V5.8Z" />
      <path d="m9 11.8 2.2 2.2 4-4.5" />
    </Svg>
  );
}

export function CompaniesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M4.5 20.5h15" />
      <path d="M6.5 20.5v-13a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v13" />
      <path d="M9.5 9.5h1.6M13 9.5h1.6M9.5 13h1.6M13 13h1.6M9.5 16.5h1.6M13 16.5h1.6" />
    </Svg>
  );
}

export function GraphIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="8" r="2.5" />
      <circle cx="10" cy="18" r="2.5" />
      <path d="m8.2 7 7.4.8M16.6 10l-5 6M7.7 8.2l1.7 7.4" />
    </Svg>
  );
}

export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M4 7.2h9M17.5 7.2H20M4 16.8h3M11.5 16.8H20" />
      <circle cx="15" cy="7.2" r="2.2" />
      <circle cx="9" cy="16.8" r="2.2" />
    </Svg>
  );
}

export function SunIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4" />
    </Svg>
  );
}

export function MoonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M20 13.6A8 8 0 0 1 10.4 4 8 8 0 1 0 20 13.6Z" />
    </Svg>
  );
}

export function LogoutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M14.5 4.5H17a1.8 1.8 0 0 1 1.8 1.8v11.4a1.8 1.8 0 0 1-1.8 1.8h-2.5" />
      <path d="M4.5 12h10M11 8.5l3.5 3.5L11 15.5" />
    </Svg>
  );
}

export function ExternalIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M9 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5V15" />
      <path d="M13.5 4.5H19.5V10.5M19 5l-8 8" />
    </Svg>
  );
}

export function CopyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <rect x="9" y="9" width="11" height="11" rx="1.8" />
      <path d="M5.5 14.5h-.7A1.8 1.8 0 0 1 3 12.7V5.3A1.8 1.8 0 0 1 4.8 3.5h7.4a1.8 1.8 0 0 1 1.8 1.8v.7" />
    </Svg>
  );
}

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  );
}

export function AlertIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M10.4 4.2 2.9 17.5A1.6 1.6 0 0 0 4.3 20h15.4a1.6 1.6 0 0 0 1.4-2.5L13.6 4.2a1.6 1.6 0 0 0-2.8 0Z" />
      <path d="M12 9.5v4M12 16.6v.2" />
    </Svg>
  );
}

export function DownloadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M12 4v10M8 10.5l4 4 4-4" />
      <path d="M4.5 16.5v2A1.8 1.8 0 0 0 6.3 20.3h11.4a1.8 1.8 0 0 0 1.8-1.8v-2" />
    </Svg>
  );
}

export function ChevronLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />
    </Svg>
  );
}

export function SpinnerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props} className={`animate-spin ${props.className ?? ""}`}>
      <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" />
    </Svg>
  );
}
