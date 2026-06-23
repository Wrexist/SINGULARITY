/** Minimal line icons (premium, Airbnb-ish). Stroke uses currentColor. */

const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function ComputeIcon() {
  return (
    <svg {...base} aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
      <path d="M9 1.5v3M15 1.5v3M9 19.5v3M15 19.5v3M1.5 9h3M1.5 15h3M19.5 9h3M19.5 15h3" />
    </svg>
  );
}

export function DataIcon() {
  return (
    <svg {...base} aria-hidden="true">
      <ellipse cx="12" cy="5.5" rx="7" ry="2.8" />
      <path d="M5 5.5v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6" />
      <path d="M5 11.5v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6" />
    </svg>
  );
}

export function MoneyIcon() {
  return (
    <svg {...base} aria-hidden="true">
      <path d="M3 17l5-5 4 3 6-7" />
      <path d="M16 5h5v5" />
    </svg>
  );
}
