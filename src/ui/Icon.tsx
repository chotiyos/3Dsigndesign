/** Authored icon set: 24px grid, 1.6 stroke, round joins. One family across the site. */
const PATHS = {
  sun: 'M12 4V2M12 22v-2M4 12H2m20 0h-2M5.6 5.6 4.2 4.2m15.6 15.6-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z',
  grid: 'M3 9h18M3 15h18M9 3v18M15 3v18M3 3h18v18H3z',
  edges: 'M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Zm0 0v18M4 7.5l8 4.5 8-4.5',
  layers: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  image: 'M4 5h16v14H4zM4 15l4.5-4.5 4 4L15 12l5 5M15.5 9.5h.01',
  download: 'M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M4 19h16',
  upload: 'M12 16V5m0 0L7.5 9.5M12 5l4.5 4.5M4 19h16',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  text: 'M5 6V4h14v2M12 4v16m-3 0h6',
  reset: 'M4 12a8 8 0 1 0 2.4-5.7L4 8.6M4 4v4.6h4.6',
  search: 'm20 20-4.2-4.2M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z',
  cart: 'M3 4h2.5l2.2 11h10.6L20.5 7H6.4M9 20h.01M17 20h.01',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0',
  chevron: 'm9 6 6 6-6 6',
  close: 'M6 6l12 12M18 6 6 18',
  menu: 'M4 7h16M4 12h16M4 17h16',
  spark: 'M12 3v4m0 10v4M3 12h4m10 0h4M6.3 6.3 9 9m6 6 2.7 2.7M6.3 17.7 9 15m6-6 2.7-2.7',
  book: 'M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm0 13a3 3 0 0 1 3-3h9',
  plug: 'M9 3v5m6-5v5M7 8h10v3a5 5 0 0 1-10 0V8Zm5 8v5',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.8M6.5 6.6C3.8 8.3 2 12 2 12s3.6 7 10 7a9.8 9.8 0 0 0 4.6-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  check: 'm5 12.5 4.5 4.5L19 7',
  arrow: 'M5 12h14m0 0-6-6m6 6-6 6',
  box: 'M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9ZM4 7.5l8 4.5 8-4.5M12 12v9',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  save: 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7',
  explode: 'M12 3v5m0 8v5M7 8h10M7 16h10M9 12h6',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  link: 'M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2.5-11.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14m0 3.5h.01',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
