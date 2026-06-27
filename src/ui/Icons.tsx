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

/* ---- Tone icons (toasts, notices, event cards) ---- */

/** Neutral info. */
export function InfoIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.8h.01" />
    </Icon>
  );
}

/** Good / success. */
export function CheckCircleIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.2 11 15l5-5.5" />
    </Icon>
  );
}

/** Bad / warning. */
export function AlertTriangleIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M12 3.5 22 20H2z" />
      <path d="M12 9.5v4.5M12 17.5h.01" />
    </Icon>
  );
}

/* ---- Status / domain icons ---- */

/** Ship / launch — a rocket. */
export function RocketIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M12 15l-3-3a22 22 0 0 1 8-10c2.7 0 5 2.3 5 5a22 22 0 0 1-10 8z" />
      <path d="M9 12H4s.5-2.8 2-4c1.4-1.1 3-1 3-1" />
      <path d="M12 15v5s2.8-.5 4-2c1.1-1.4 1-3 1-3" />
      <path d="M4.5 16.5c-1.3 1.1-1.8 4.5-1.8 4.5s3.4-.5 4.5-1.8" />
      <circle cx="15" cy="9" r="1.2" />
    </Icon>
  );
}

/** Training / level-up — a graduation cap. */
export function GradCapIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M2.5 8.5 12 4l9.5 4.5L12 13z" />
      <path d="M6.5 10.7V15c0 1.3 2.5 2.4 5.5 2.4s5.5-1.1 5.5-2.4v-4.3" />
      <path d="M21.5 8.7v4.8" />
    </Icon>
  );
}

/** Open-source — a globe. */
export function GlobeIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.6 2.4 4 5.6 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.6-4-9s1.4-6.6 4-9z" />
    </Icon>
  );
}

/** Money / business — a coin. */
export function CoinIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M14.4 9.3c0-1.1-1.1-1.8-2.4-1.8s-2.4.7-2.4 1.7.8 1.5 2.4 1.7 2.4.8 2.4 1.9-1.1 1.8-2.4 1.8-2.4-.7-2.4-1.8" />
    </Icon>
  );
}

/** Conflict / hard mode — crossed swords. */
export function SwordsIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M16.5 4H20v3.5L9.5 18" />
      <path d="M7.5 4H4v3.5L14.5 18" />
      <path d="M14.5 18 18 21.5M9.5 18 6 21.5" />
    </Icon>
  );
}

/** Poison / risk — a skull. */
export function SkullIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M12 3a8 8 0 0 0-5 14v2.5h10V17a8 8 0 0 0-5-14z" />
      <circle cx="9" cy="11.5" r="1.5" />
      <circle cx="15" cy="11.5" r="1.5" />
      <path d="M10 19.5v-2M14 19.5v-2" />
    </Icon>
  );
}

/** Falling behind / churn — a downward trend. */
export function TrendDownIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M3 7l6 6 4-3 7 7" />
      <path d="M21 12v5h-5" />
    </Icon>
  );
}

/** Ready / shiny — a sparkle. */
export function SparkIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M12 3c.7 4.3 1.9 5.5 6 6-4.1.5-5.3 1.7-6 6-.7-4.3-1.9-5.5-6-6 4.1-.5 5.3-1.7 6-6z" />
    </Icon>
  );
}

/** Sold / price — a tag. */
export function TagIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M3.5 12.8 11.2 5H18v6.8l-7.7 7.7a1.5 1.5 0 0 1-2.1 0l-4.7-4.7a1.5 1.5 0 0 1 0-2.1z" />
      <circle cx="14.5" cy="8.5" r="1.3" />
    </Icon>
  );
}

/** Research / science — an atom. */
export function AtomIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="1.6" />
      <ellipse cx="12" cy="12" rx="9" ry="4" />
      <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(120 12 12)" />
    </Icon>
  );
}

/** Speed / power — a lightning bolt. */
export function BoltIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M13 2.5 5 13.5h5l-1 8 8-11h-5z" />
    </Icon>
  );
}

/** Target / focus. */
export function TargetIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </Icon>
  );
}

/** Ads / announcement — a megaphone. */
export function MegaphoneIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M3 10v4h3.5L18 18V6L6.5 10z" />
      <path d="M6.5 14 8 19.5h2.4L9 14" />
    </Icon>
  );
}

/** Organic growth — a sprout. */
export function SproutIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M12 21v-9" />
      <path d="M12 12c0-3 2.4-5 6-5 0 3-2.4 5-6 5z" />
      <path d="M12 14c0-2.5-2-4.5-5-4.5 0 2.5 2 4.5 5 4.5z" />
    </Icon>
  );
}

/** A single person — influencer / profile. */
export function PersonIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </Icon>
  );
}

/** Events — a microphone. */
export function MicIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v4M9 21h6" />
    </Icon>
  );
}

/** Reasoning — a brain. */
export function BrainIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M12 5.4a3 3 0 0 0-5.5 1.7A3 3 0 0 0 5 12a3 3 0 0 0 2 4.8A2.7 2.7 0 0 0 12 18.4z" />
      <path d="M12 5.4a3 3 0 0 1 5.5 1.7A3 3 0 0 1 19 12a3 3 0 0 1-2 4.8A2.7 2.7 0 0 1 12 18.4z" />
      <path d="M12 5.4v13" />
    </Icon>
  );
}

/** Domain / law — balance scales. */
export function ScalesIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M12 4v16M7.5 20h9" />
      <path d="M5 8h14M12 5.5 5 8M12 5.5 19 8" />
      <path d="M5 8 2.5 13a3 3 0 0 0 5 0z" />
      <path d="M19 8l-2.5 5a3 3 0 0 0 5 0z" />
    </Icon>
  );
}

/** Companion — a heart. */
export function HeartIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M12 20s-7-4.4-7-9.5A3.8 3.8 0 0 1 12 7a3.8 3.8 0 0 1 7 3.5C19 15.6 12 20 12 20z" />
    </Icon>
  );
}

/** General chat / conversation. */
export function ChatIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M4 5h16v11H8.5L4 19.5z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </Icon>
  );
}

/** Secret / unknown — a question mark. */
export function HelpIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M9.2 9.2a2.8 2.8 0 0 1 5.5.8c0 2-2.7 2.4-2.7 4.2" />
      <path d="M12 18h.01" />
    </Icon>
  );
}

/** Code. */
export function CodeIcon({ size = 18 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M8.5 8 4.5 12l4 4M15.5 8l4 4-4 4M13.5 6l-3 12" />
    </Icon>
  );
}
