import type { SVGProps } from "react";
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronLeft,
  Copy,
  Download,
  ExternalLink,
  FilePlus2,
  LayoutGrid,
  LoaderCircle,
  LogOut,
  Moon,
  Settings2,
  ShieldCheck,
  Sun,
  Waypoints,
} from "lucide-react";

/* Icon layer: shadcn's default set (lucide-react) under our stable export
 * names, so pages and tests don't churn. All inherit color via
 * currentColor; LogoMark stays custom (brand mark). */

type IconProps = SVGProps<SVGSVGElement>;

/** Brand mark: three connected nodes — the knowledge graph. */
export function LogoMark(props: IconProps) {
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

export function DashboardIcon(props: IconProps) {
  return <LayoutGrid aria-hidden {...props} />;
}

export function NewJobIcon(props: IconProps) {
  return <FilePlus2 aria-hidden {...props} />;
}

export function ReviewIcon(props: IconProps) {
  return <ShieldCheck aria-hidden {...props} />;
}

export function CompaniesIcon(props: IconProps) {
  return <Building2 aria-hidden {...props} />;
}

export function GraphIcon(props: IconProps) {
  return <Waypoints aria-hidden {...props} />;
}

export function SettingsIcon(props: IconProps) {
  return <Settings2 aria-hidden {...props} />;
}

export function SunIcon(props: IconProps) {
  return <Sun aria-hidden {...props} />;
}

export function MoonIcon(props: IconProps) {
  return <Moon aria-hidden {...props} />;
}

export function LogoutIcon(props: IconProps) {
  return <LogOut aria-hidden {...props} />;
}

export function ExternalIcon(props: IconProps) {
  return <ExternalLink aria-hidden {...props} />;
}

export function CopyIcon(props: IconProps) {
  return <Copy aria-hidden {...props} />;
}

export function CheckIcon(props: IconProps) {
  return <Check aria-hidden {...props} />;
}

export function AlertIcon(props: IconProps) {
  return <AlertTriangle aria-hidden {...props} />;
}

export function DownloadIcon(props: IconProps) {
  return <Download aria-hidden {...props} />;
}

export function ChevronLeftIcon(props: IconProps) {
  return <ChevronLeft aria-hidden {...props} />;
}

export function SpinnerIcon({ className, ...props }: IconProps) {
  return <LoaderCircle aria-hidden className={className} {...props} />;
}
