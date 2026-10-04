// Website-only layout helpers, used by `*.web.tsx` screens. Never imported by
// anything the Android bundle contains.
import { useSyncExternalStore } from 'react';
import { useWindowDimensions } from 'react-native';

const noopSubscribe = () => () => {};

/**
 * False during the static-HTML render and hydration, true once the page is
 * running in the browser. Desktop layouts wait for this so the hydrated tree
 * always matches the server HTML first.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

// Must match the breakpoints in web-shell.css.
export const WEB_DESKTOP_MIN = 768;
export const WEB_WIDE_MIN = 1264;
const RAIL_COMPACT = 76;
const RAIL_WIDE = 248;

export type WebLayout = {
  /** True from 768px up, once hydrated. Below that the phone layout renders. */
  isDesktop: boolean;
  /** Page width beside the sidebar. */
  avail: number;
  /** Width of the centred content column. */
  content: number;
  /** Main column + right column side by side. */
  twoCol: boolean;
  main: number;
  side: number;
  colGap: number;
};

export function useWebLayout(): WebLayout {
  const { width } = useWindowDimensions();
  const hydrated = useHydrated();
  const rail = width >= WEB_WIDE_MIN ? RAIL_WIDE : width >= WEB_DESKTOP_MIN ? RAIL_COMPACT : 0;
  const avail = width - rail;
  const pad = avail >= 1100 ? 48 : 32;
  const content = Math.max(0, Math.min(1200, avail - pad * 2));
  const twoCol = content >= 980;
  const side = 340;
  const colGap = 32;
  return {
    isDesktop: hydrated && width >= WEB_DESKTOP_MIN,
    avail,
    content,
    twoCol,
    main: twoCol ? content - side - colGap : content,
    side,
    colGap,
  };
}

/** RN-web turns `dataSet` into data-* attributes; web-shell.css keys off them. */
export const webDisplayFont = { dataSet: { font: 'display' } } as object;
export const webHoverLift = { dataSet: { hover: 'lift' } } as object;
export const webHoverRow = { dataSet: { hover: 'row' } } as object;
