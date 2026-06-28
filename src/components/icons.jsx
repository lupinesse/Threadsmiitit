/**
 * @fileoverview Inline SVG icon set for Threadsmiitit.
 * All icons use `currentColor` for stroke so they inherit the surrounding text colour.
 */

/**
 * Base icon wrapper. Children should be SVG path/shape elements.
 * @param {object} props
 */
function Icon({ size = 24, sw = 1.8, fill = 'none', children, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {children}
    </svg>
  );
}

export const IconList = (p) => (
  <Icon {...p}>
    <line x1="8" y1="6" x2="20" y2="6" />
    <line x1="8" y1="12" x2="20" y2="12" />
    <line x1="8" y1="18" x2="20" y2="18" />
    <circle cx="4" cy="6" r="1" />
    <circle cx="4" cy="12" r="1" />
    <circle cx="4" cy="18" r="1" />
  </Icon>
);

export const IconCalendar = (p) => (
  <Icon {...p}>
    <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="8" y1="2.5" x2="8" y2="6" />
    <line x1="16" y1="2.5" x2="16" y2="6" />
  </Icon>
);

export const IconPlus = (p) => (
  <Icon {...p}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </Icon>
);

export const IconInfo = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="11" x2="12" y2="16.5" />
    <circle cx="12" cy="7.8" r="0.6" fill="currentColor" />
  </Icon>
);

export const IconClock = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15.5 14" />
  </Icon>
);

export const IconPin = (p) => (
  <Icon {...p}>
    <path d="M12 21s7-6.4 7-11.5A7 7 0 0 0 5 9.5C5 14.6 12 21 12 21z" />
    <circle cx="12" cy="9.3" r="2.4" />
  </Icon>
);

export const IconChevron = (p) => (
  <Icon {...p}>
    <polyline points="9 6 15 12 9 18" />
  </Icon>
);

export const IconChevronDown = (p) => (
  <Icon {...p}>
    <polyline points="6 9 12 15 18 9" />
  </Icon>
);

export const IconArrowLeft = (p) => (
  <Icon {...p}>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="11 18 5 12 11 6" />
  </Icon>
);

export const IconArrowUpRight = (p) => (
  <Icon {...p}>
    <line x1="7" y1="17" x2="17" y2="7" />
    <polyline points="7 7 17 7 17 17" />
  </Icon>
);

export const IconClose = (p) => (
  <Icon {...p}>
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </Icon>
);

export const IconSearch = (p) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <line x1="16.5" y1="16.5" x2="21" y2="21" />
  </Icon>
);

export const IconUsers = (p) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <path d="M16 5.2a3 3 0 0 1 0 5.8" />
    <path d="M18 14.2c2 .6 3.5 2.4 3.5 4.8" />
  </Icon>
);

export const IconHeart = (p) => (
  <Icon {...p}>
    <path d="M12 20s-7-4.6-7-9.6A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 7 3.4C19 15.4 12 20 12 20z" />
  </Icon>
);

export const IconCheck = (p) => (
  <Icon {...p}>
    <polyline points="4 12.5 9.5 18 20 6" />
  </Icon>
);

export const IconMic = (p) => (
  <Icon {...p}>
    <rect x="9" y="2.5" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
    <line x1="12" y1="18" x2="12" y2="21.5" />
    <line x1="8.5" y1="21.5" x2="15.5" y2="21.5" />
  </Icon>
);

export const IconSpark = (p) => (
  <Icon {...p}>
    <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3z" />
  </Icon>
);

export const IconThreads = (p) => (
  <Icon {...p} sw={p.sw ?? 1.6}>
    <path d="M12.2 21.5c-5.2 0-8.7-3.7-8.7-9.4 0-5.8 3.6-9.6 8.8-9.6 3.6 0 6.2 1.6 7.4 4.4M12.2 21.5c4.7 0 6.6-2.6 6.6-4.8 0-2.5-2.2-3.8-4.8-3.8-2.2 0-3.9 1.1-3.9 2.8 0 1.5 1.3 2.4 2.8 2.4 2.6 0 4-2.1 4-5.2" />
  </Icon>
);

export const IconCopy = (p) => (
  <Icon {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Icon>
);

export const IconBell = (p) => (
  <Icon {...p}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </Icon>
);
