import { useEffect, useRef, useState } from 'react';

const TRIGGER = 72;

/** Touch-only refresh for the website's nested scrolling pages. */
export function usePullToRefresh(route: string) {
  const mainRef = useRef<HTMLElement>(null);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    let startX = 0,
      startY = 0,
      pull = 0,
      active = false;
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;
    const reset = () => {
      active = false;
      pull = 0;
      setDistance(0);
    };
    const atTop = (target: Element) => {
      for (let node: Element | null = target; node; node = node.parentElement) {
        if (node.scrollTop > 1) return false;
      }
      return true;
    };
    const start = (event: TouchEvent) => {
      reset();
      const target = event.target;
      if (!matchMedia('(max-width: 767px)').matches || event.touches.length !== 1 || !(target instanceof Element))
        return;
      if (
        target.closest('input, textarea, select, [contenteditable], canvas, .leaflet-container, [data-no-pull-refresh]')
      )
        return;
      if (document.querySelector('dialog[open], [aria-modal="true"], .ts-rail.is-menu-open') || !atTop(target)) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      active = true;
    };
    const move = (event: TouchEvent) => {
      if (!active) return;
      if (event.target instanceof Element && !atTop(event.target)) {
        reset();
        return;
      }
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      const dx = Math.abs(event.touches[0].clientX - startX);
      const dy = event.touches[0].clientY - startY;
      if (dx > 12 && dx > Math.abs(dy)) {
        reset();
        return;
      }
      if (dy <= 0) {
        pull = 0;
        setDistance(0);
        return;
      }
      if (!event.cancelable) {
        reset();
        return;
      }
      event.preventDefault();
      pull = Math.min(96, dy * 0.55);
      setDistance(pull);
    };
    const end = () => {
      if (!active) return;
      if (pull >= TRIGGER) {
        active = false;
        setRefreshing(true);
        reloadTimer = setTimeout(() => window.location.reload(), 100);
      } else reset();
    };
    main.addEventListener('touchstart', start, { passive: true });
    main.addEventListener('touchmove', move, { passive: false });
    main.addEventListener('touchend', end);
    main.addEventListener('touchcancel', reset);
    return () => {
      main.removeEventListener('touchstart', start);
      main.removeEventListener('touchmove', move);
      main.removeEventListener('touchend', end);
      main.removeEventListener('touchcancel', reset);
      clearTimeout(reloadTimer);
    };
  }, [route]);

  return { mainRef, distance, refreshing, ready: distance >= TRIGGER };
}
