/**
 * Measures main-thread health on a route, which is what "feels slow" actually
 * means: long tasks blocking input, and how much JS is executing while the
 * screen just sits there idle.
 *
 *   node e2e/perf.js            # home
 *   node e2e/perf.js /search
 */
const { chromium } = require('playwright');

const WEB = process.env.WEB_URL || 'http://localhost:8081';
const ROUTE = process.argv[2] || '/';
const IDLE_MS = 8000;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } });

  // A desktop CPU runs this at a flat 60fps and hides everything. The point
  // is how it behaves on a mid-range phone, so throttle to something in that
  // neighbourhood — otherwise every measurement here says "fine" while the
  // device stutters.
  const CPU_THROTTLE = Number(process.env.CPU_THROTTLE || 6);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  console.log(`(CPU throttled ${CPU_THROTTLE}x to approximate a phone)`);

  await page.goto(`${WEB}${ROUTE}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page
    .waitForFunction(() => Array.from(document.querySelectorAll('img')).every((i) => i.complete), null, { timeout: 15000 })
    .catch(() => {});
  await page.waitForTimeout(Number(process.env.SETTLE_MS || 1200));

  // Instrument: long tasks + rAF frame intervals, measured while idle.
  await page.evaluate(() => {
    window.__perf = { longTasks: [], frames: [], timers: 0 };
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__perf.longTasks.push(Math.round(e.duration));
      }).observe({ entryTypes: ['longtask'] });
    } catch {}

    let last = performance.now();
    const tick = (t) => {
      window.__perf.frames.push(t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    // Count how many timers the page keeps arming while idle.
    const si = window.setInterval;
    const st = window.setTimeout;
    window.setInterval = function (...a) { window.__perf.timers++; return si.apply(this, a); };
    window.setTimeout = function (...a) { window.__perf.timers++; return st.apply(this, a); };
  });

  await page.waitForTimeout(IDLE_MS);

  const perf = await page.evaluate(() => {
    const f = window.__perf.frames.filter((x) => x > 0);
    f.sort((a, b) => a - b);
    const pct = (p) => f[Math.floor(f.length * p)] || 0;
    const lt = window.__perf.longTasks;
    return {
      frameCount: f.length,
      medianFrameMs: +pct(0.5).toFixed(1),
      p95FrameMs: +pct(0.95).toFixed(1),
      worstFrameMs: +(f[f.length - 1] || 0).toFixed(1),
      approxFps: +(1000 / (pct(0.5) || 16.7)).toFixed(1),
      jankyFrames: f.filter((x) => x > 32).length, // missed a 30fps budget
      longTasks: lt.length,
      longTaskTotalMs: lt.reduce((a, b) => a + b, 0),
      worstLongTaskMs: Math.max(0, ...lt),
      timersArmedWhileIdle: window.__perf.timers,
    };
  });

  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const paints = {};
    for (const p of performance.getEntriesByType('paint')) paints[p.name] = Math.round(p.startTime);
    return {
      domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd || 0),
      loadMs: Math.round(nav.loadEventEnd || 0),
      firstContentfulPaintMs: paints['first-contentful-paint'] || null,
      jsHeapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      domNodes: document.getElementsByTagName('*').length,
    };
  });

  console.log(`route: ${ROUTE}   (${IDLE_MS / 1000}s idle observation)`);
  console.log(JSON.stringify({ ...metrics, ...perf }, null, 2));
  await browser.close();
})();
