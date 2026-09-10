// A small, original line-icon set for the sidebar — deliberately not emoji.
// Each icon shares the same stroke-only style so the set reads as one
// family; color/weight come from CSS (currentColor), sizing from the
// .sidebar-nav-icon class.

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function HomeIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9h5v-5h2v5h5v-9" />
    </svg>
  );
}

export function DashboardIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5 19V11" />
      <path d="M12 19V5" />
      <path d="M19 19v-7" />
    </svg>
  );
}

export function UploadIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 16V5" />
      <path d="M7 9l5-5 5 5" />
      <path d="M5 19h14" />
    </svg>
  );
}

export function QuizIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M8.5 12.5l2.3 2.3L16 9.5" />
    </svg>
  );
}

export function ReviewIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 12a7.5 7.5 0 0 1 12.6-5.5" />
      <path d="M19.5 12a7.5 7.5 0 0 1-12.6 5.5" />
      <path d="M17 3.5v3.5h-3.5" />
      <path d="M7 20.5V17h3.5" />
    </svg>
  );
}

export function UnwindIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 18c-2-6 2-12 12-12 0 8-4 12-12 12Z" />
      <path d="M6 18c3-3 6-6 12-12" />
    </svg>
  );
}

export function LoginIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8.2" r="3.2" />
      <path d="M5 20c1.4-4 4-6.2 7-6.2s5.6 2.2 7 6.2" />
    </svg>
  );
}
