/** Minimal line icons (premium, liquid-glass). Stroke uses currentColor so each
    icon tints itself from its container's `color`. No image assets (GDD). */

import type { ReactNode } from "react";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Icon({ size = 18, children }: { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      {children}
    </svg>
  );
}

type IconProps = { size?: number };

export function ComputeIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
      <path d="M9 1.5v3M15 1.5v3M9 19.5v3M15 19.5v3M1.5 9h3M1.5 15h3M19.5 9h3M19.5 15h3" />
    </Icon>
  );
}

export function DataIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <ellipse cx="12" cy="5.5" rx="7" ry="2.8" />
      <path d="M5 5.5v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6" />
      <path d="M5 11.5v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6" />
    </Icon>
  );
}

export function MoneyIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M3 17l5-5 4 3 6-7" />
      <path d="M16 5h5v5" />
    </Icon>
  );
}

export function GearIcon({ size = 20 }: IconProps) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v2.4M12 19.1v2.4M21.5 12h-2.4M4.9 12H2.5M18.7 5.3l-1.7 1.7M7 17l-1.7 1.7M18.7 18.7L17 17M7 7L5.3 5.3" />
    </Icon>
  );
}

/** Lab — a beaker/flask. */
export function FlaskIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M9 3h6" />
      <path d="M10 3v6l-5.2 9.2A1.8 1.8 0 0 0 6.4 21h11.2a1.8 1.8 0 0 0 1.6-2.8L14 9V3" />
      <path d="M7.3 14.5h9.4" />
    </Icon>
  );
}

/** Products — a shipping box / package. */
export function BoxIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M3 7.6 12 3l9 4.6v8.8L12 21l-9-4.6z" />
      <path d="M3 7.6 12 12l9-4.4M12 12v9" />
      <path d="M7.5 5.3 16.5 9.9" />
    </Icon>
  );
}

/** Team — two people. */
export function TeamIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <circle cx="9" cy="8" r="3.1" />
      <path d="M3.6 19a5.4 5.4 0 0 1 10.8 0" />
      <path d="M16 5.3a3 3 0 0 1 0 5.7" />
      <path d="M17.2 14.2A5.4 5.4 0 0 1 20.4 19" />
    </Icon>
  );
}

/** Awards — a trophy. */
export function TrophyIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M7 4h10v4.5a5 5 0 0 1-10 0z" />
      <path d="M7 5.2H4.6A2.4 2.4 0 0 0 9 7.6" />
      <path d="M17 5.2h2.4A2.4 2.4 0 0 1 15 7.6" />
      <path d="M12 13.5v3.5" />
      <path d="M9 21h6M9.6 21l.5-4h3.8l.5 4" />
    </Icon>
  );
}

/** Daily reward — a wrapped gift. */
export function GiftIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <rect x="3.5" y="8" width="17" height="4" rx="1.2" />
      <path d="M5 12v7.6a1.4 1.4 0 0 0 1.4 1.4h11.2a1.4 1.4 0 0 0 1.4-1.4V12" />
      <path d="M12 8v13" />
      <path d="M12 8s-.9-4.5-3.4-4.5A2.1 2.1 0 0 0 8.6 8z" />
      <path d="M12 8s.9-4.5 3.4-4.5A2.1 2.1 0 0 1 15.4 8z" />
    </Icon>
  );
}

/** Morale — a smiley face. */
export function SmileIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.3 14.2a4.2 4.2 0 0 0 7.4 0" />
      <path d="M9 9.5h.01M15 9.5h.01" />
    </Icon>
  );
}

/** Payroll — a banknote. */
export function BanknoteIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 9.5h.01M18 14.5h.01" />
    </Icon>
  );
}

/** Revenue — a bar chart. */
export function BarsIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M4 20.5h16" />
      <path d="M6.5 20.5v-6M12 20.5V7.5M17.5 20.5v-9.5" />
    </Icon>
  );
}

/** Lab Reputation — a classical landmark / bank. */
export function LandmarkIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M12 3 21 8H3z" />
      <path d="M5 11v7M9.4 11v7M14.6 11v7M19 11v7" />
      <path d="M3.5 21h17M4 18h16" />
    </Icon>
  );
}

/** Office perks — a tall building. */
export function BuildingIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <rect x="5.5" y="3" width="13" height="18" rx="1.6" />
      <path d="M9.2 7h.01M14.8 7h.01M9.2 11h.01M14.8 11h.01M9.2 15h.01M14.8 15h.01" />
      <path d="M10.5 21v-3h3v3" />
    </Icon>
  );
}

/** Hall theme — an artist's palette. */
export function PaletteIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M12 3a9 9 0 1 0 0 18c1 0 1.7-.8 1.7-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.1 0-1 .8-1.8 1.8-1.8H16a5 5 0 0 0 5-5C21 6.3 17 3 12 3z" />
      <path d="M7.6 11h.01M10.8 7.6h.01M15 8h.01" />
    </Icon>
  );
}

/** Back up / save — a download tray. */
export function DownloadIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M12 3v11M7.5 10 12 14.5 16.5 10" />
      <path d="M4.5 17v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" />
    </Icon>
  );
}

/** Locked. */
export function LockIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </Icon>
  );
}

/** Check / active. */
export function CheckIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M5 12.5 9.5 17 19 7" />
    </Icon>
  );
}
