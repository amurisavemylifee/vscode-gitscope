/**
 * Набор иконок панели.
 *
 * Inline SVG, а не codicon-шрифт: шрифт пришлось бы отдельно класть в бандл и
 * разрешать в CSP, а нужно из него полтора десятка глифов. `currentColor`
 * означает, что иконки автоматически попадают в цвет темы.
 */

export type IconName =
  | 'branch'
  | 'remote'
  | 'tag'
  | 'commit'
  | 'swap'
  | 'refresh'
  | 'download'
  | 'chevron-right'
  | 'chevron-down'
  | 'chevron-up'
  | 'unfold'
  | 'file'
  | 'folder'
  | 'columns'
  | 'rows'
  | 'warning'
  | 'search';

const PATHS: Record<IconName, string> = {
  branch: 'M6 3v12M6 21a3 3 0 100-6 3 3 0 000 6zM6 6a3 3 0 100-6 3 3 0 000 6zM18 9a3 3 0 100-6 3 3 0 000 6zM18 9v1a4 4 0 01-4 4h-4',
  remote: 'M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z',
  tag: 'M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0l-7.2-7.2A2 2 0 013 12V5a2 2 0 012-2h7a2 2 0 011.4.6l7.2 7.2a2 2 0 010 2.6zM7.5 7.5h.01',
  commit: 'M12 16a4 4 0 100-8 4 4 0 000 8zM1.05 12H8M16 12h6.95',
  swap: 'M7 4v13M7 4L4 7M7 4l3 3M17 20V7M17 20l-3-3M17 20l3-3',
  refresh: 'M21 12a9 9 0 11-3.5-7.1M21 3v6h-6',
  download: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
  'chevron-right': 'M9 18l6-6-6-6',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-up': 'M18 15l-6-6-6 6',
  unfold: 'M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M16 21h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3',
  file: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6',
  folder: 'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z',
  columns: 'M4 3h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1zM12 3v18',
  rows: 'M4 3h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1zM3 12h18',
  warning: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35',
};

interface IconProps {
  readonly name: IconName;
  readonly size?: number;
  readonly className?: string;
}

export function Icon({ name, size = 14, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
