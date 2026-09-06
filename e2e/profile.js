/**
 * CPU profile of a route while it sits idle, aggregated to the functions
 * actually burning main-thread time. Answers "what is it doing" rather than
 * "how slow is it".
 *
 *   node e2e/profile.js            # home, 8s sample
 */
const { chromium } = require('playwright');

const WEB = process.env.WEB_URL || 'http://localhost:8081';
const ROUTE = process.argv[2] || '/';
const SAMPLE_MS = Number(process.env.SAMPLE_MS || 8000);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU_THROTTLE || 6) });

  await page.goto(`${WEB}${ROUTE}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(Number(process.env.SETTLE_MS || 12000)); // let startup finish

  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await page.waitForTimeout(SAMPLE_MS);
  const { profile } = await cdp.send('Profiler.stop');

  // Aggregate self-time per node, then roll up by function name.
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const selfTicks = new Map();
  for (const id of profile.samples || []) selfTicks.set(id, (selfTicks.get(id) || 0) + 1);

  const totalTicks = (profile.samples || []).length;
  const durationMs = (profile.endTime - profile.startTime) / 1000;
  const msPerTick = totalTicks ? durationMs / totalTicks : 0;

  const byFn = new Map();
  for (const [id, ticks] of selfTicks) {
    const n = byId.get(id);
    if (!n) continue;
    const cf = n.callFrame || {};
    const name = cf.functionName || '(anonymous)';
    const url = (cf.url || '').split('/').slice(-1)[0];
    const key = `${name}  [${url}:${cf.lineNumber ?? '?'}]`;
    byFn.set(key, (byFn.get(key) || 0) + ticks);
  }

  const rows = [...byFn.entries()]
    .map(([k, ticks]) => ({ fn: k, ms: +(ticks * msPerTick).toFixed(0), pct: +((ticks / totalTicks) * 100).toFixed(1) }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 25);

  console.log(`route ${ROUTE} — ${durationMs.toFixed(0)}ms sampled while idle\n`);
  console.log('  ms     %     function');
  for (const r of rows) console.log(String(r.ms).padStart(6), String(r.pct).padStart(5), '  ' + r.fn);

  await browser.close();
})();
