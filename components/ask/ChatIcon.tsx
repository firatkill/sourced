const paths = {
  left: 'm15 18-6-6 6-6',
  right: 'm9 18 6-6-6-6',
  close: 'm6 6 12 12M6 18 18 6',
  external: 'M7 17 17 7M7 7h10v10',
  up: 'M12 19V5m-6 6 6-6 6 6',
  menu: 'M4 7h16M4 12h16M4 17h10',
  newChat: 'M12 5H5v14h14v-7M16 3l5 5-9 9H7v-5Z',
  copy: 'M9 9h12v12H9ZM5 15V5a2 2 0 0 1 2-2h10',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  info: 'M12 16v-4M12 8h.01',
  github:
    'M9 19c-4 1.5-4-2-6-2.5M15 22v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6.2 0C6.6 2.8 5.6 3.1 5.6 3.1a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 4.2 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V22',
};
export function ChatIcon({
  name,
  size = 16,
  className,
}: {
  name: keyof typeof paths;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {name === 'info' && <circle cx="12" cy="12" r="9" />}
      <path d={paths[name]} />
    </svg>
  );
}
