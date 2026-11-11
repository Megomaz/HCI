/** Inline icons. Always decorative: the text label next to them carries the meaning. */

const PATHS = {
  simplify:
    '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z"/>',
  speaker:
    '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z"/><path d="M15.5 9a4.2 4.2 0 010 6"/><path d="M18 6.5a8 8 0 010 11"/>',
  retry: '<path d="M20 12a8 8 0 11-2.6-5.9"/><path d="M20 4v5h-5"/>',
  pause: '<path d="M8.5 5v14M15.5 5v14"/>',
  play: '<path d="M7 4.5v15l12-7.5-12-7.5z"/>',
  replay: '<path d="M4 12a8 8 0 102.6-5.9"/><path d="M4 4v5h5"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  back: '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>',
  document:
    '<path d="M7 3h7l4 4v14H7V3z"/><path d="M14 3v4h4"/><path d="M10 12h5M10 16h5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5v.5"/>',
  warning:
    '<path d="M12 3.5L2.5 20h19L12 3.5z"/><path d="M12 10v5"/><path d="M12 17.5v.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, size = 24): string {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
}
