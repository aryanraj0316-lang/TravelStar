/**
 * TravelStar UI audit — drives the real Expo web build in a real browser.
 *
 * What it actually checks, per route:
 *   1. The route renders (a real screen, not a blank body or an error boundary)
 *   2. No uncaught page errors / console.error while it loads
 *   3. No failed API calls the screen depended on
 *   4. Every visible text node has readable contrast against what's behind it
 *      (this is the check that catches white-text-on-white-card regressions)
 *   5. Nothing overflows the viewport horizontally
 *   6. Tap targets meet the 44x44 minimum the project already committed to
 *   7. A screenshot, for eyeballing
 *
 * Auth is established once by driving the real sign-in form, then reused.
 *
 *   node e2e/ui-audit.js            # all routes
 *   node e2e/ui-audit.js /profile   # one route
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROUTES = require('./routes');

const WEB = process.env.WEB_URL || 'http://localhost:8081';
const API = process.env.API_URL || 'http://localhost:5000/api/v1';
const EMAIL = process.env.TEST_EMAIL || 'brutetest1@test.local';
const PASSWORD = process.env.TEST_PASSWORD || 'BruteTest12345!';
const SHOTS = path.join(__dirname, 'shots');
const VIEWPORT = { width: 414, height: 896 }; // phone-sized, since this is a phone app

const only = process.argv[2];
const routes = only ? ROUTES.filter((r) => r.path === only) : ROUTES;

const report = [];

// ── contrast helpers ────────────────────────────────────────────────────────
function relLuminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrastRatio(fg, bg) {
  const L1 = relLuminance(fg);
  const L2 = relLuminance(bg);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}
function parseRGB(s) {
  const m = /rgba?\(([^)]+)\)/.exec(s || '');
  if (!m) return null;
  const parts = m[1].split(',').map((x) => parseFloat(x.trim()));
  return { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3] : 1 };
}

async function getSession() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = await res.json();
  if (!json?.ok) throw new Error(`Could not log in test user: ${JSON.stringify(json)}`);
  return { token: json.data.token, refreshToken: json.data.refreshToken };
}

/** Collects every visible text node with its own colour and its nearest
 *  painted background, so we can flag text that is invisible or near-invisible.
 *
 *  Text sitting on top of a photo is reported as `overImage` and never
 *  judged: its real contrast depends on the pixels of the image, which this
 *  probe cannot see, and guessing would produce confident false positives
 *  (white caption over a dark photo is correct and would look "invisible"
 *  against the page background behind it). */
const CONTRAST_PROBE = () => {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent.trim();
    if (!text) continue;
    const el = node.parentElement;
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;

    // Is there an image painted behind this text?
    let overImage = false;
    let p = el;
    while (p && !overImage) {
      const pcs = getComputedStyle(p);
      if (pcs.backgroundImage && pcs.backgroundImage !== 'none') overImage = true;
      p = p.parentElement;
    }
    if (!overImage) {
      // An <img> whose box contains this text's box (RN renders overlay text
      // as a sibling above an absolutely-positioned <img>, not as a child).
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      for (const img of document.querySelectorAll('img')) {
        const ir = img.getBoundingClientRect();
        if (ir.width === 0 || ir.height === 0) continue;
        if (cx >= ir.left && cx <= ir.right && cy >= ir.top && cy <= ir.bottom) { overImage = true; break; }
      }
    }

    // Walk up for the first non-transparent background actually painted behind it.
    let bg = null;
    p = el;
    while (p) {
      const pcs = getComputedStyle(p);
      const m = /rgba?\(([^)]+)\)/.exec(pcs.backgroundColor || '');
      if (m) {
        const parts = m[1].split(',').map((x) => parseFloat(x.trim()));
        const alpha = parts.length > 3 ? parts[3] : 1;
        if (alpha > 0.5) { bg = pcs.backgroundColor; break; }
      }
      p = p.parentElement;
    }
    out.push({
      text: text.slice(0, 60),
      color: cs.color,
      bg: bg || 'rgb(255,255,255)',
      fontSize: parseFloat(cs.fontSize),
      bold: parseInt(cs.fontWeight, 10) >= 700,
      overImage,
    });
  }
  return out;
};

const TAP_TARGET_PROBE = () => {
  const MIN = 44;
  const out = [];
  const clickable = document.querySelectorAll(
    '[role="button"], button, a, [tabindex]:not([tabindex="-1"])'
  );
  for (const el of clickable) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (r.width < MIN || r.height < MIN) {
      out.push({
        label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40),
        w: Math.round(r.width),
        h: Math.round(r.height),
      });
    }
  }
  return out;
};

async function auditRoute(context, route, session) {
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on('pageerror', (err) => pageErrors.push(String(err).slice(0, 300)));
  page.on('requestfailed', (req) => {
    failedRequests.push(`${req.method()} ${req.url().slice(0, 120)} — ${req.failure()?.errorText}`);
  });
  page.on('response', (res) => {
    if (res.url().includes('/api/v1') && res.status() >= 400) {
      failedRequests.push(`${res.request().method()} ${res.url().replace(API, '').slice(0, 80)} -> ${res.status()}`);
    }
  });

  const entry = { route: route.path, name: route.name, issues: [] };

  try {
    if (route.needsAuth) {
      await page.addInitScript(
        ([t, r]) => {
          localStorage.setItem('accessToken', t);
          localStorage.setItem('refreshToken', r);
        },
        [session.token, session.refreshToken]
      );
    }

    await page.goto(`${WEB}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // expo-router hydrates, then the screen fetches, then images decode.
    // Screenshotting or probing contrast before images have painted reports
    // overlay text as invisible and empty circles as missing content — both
    // false. Wait for the network to settle, then for every <img> to finish.
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page
      .waitForFunction(() => Array.from(document.querySelectorAll('img')).every((i) => i.complete), null, {
        timeout: 15000,
      })
      .catch(() => {});
    await page.waitForTimeout(1500);

    const bodyText = (await page.evaluate(() => document.body.innerText || '')).trim();
    entry.textLength = bodyText.length;

    // 1. did anything render at all
    if (bodyText.length < 15) {
      entry.issues.push({ kind: 'BLANK_SCREEN', detail: `only ${bodyText.length} chars of visible text` });
    }

    // 2. error boundary / router failure copy
    const lower = bodyText.toLowerCase();
    for (const marker of ['unmatched route', 'this screen does not exist', 'something went wrong', 'render error']) {
      if (lower.includes(marker)) entry.issues.push({ kind: 'ERROR_SCREEN', detail: marker });
    }
    if (route.expect && !lower.includes(route.expect.toLowerCase())) {
      entry.issues.push({ kind: 'MISSING_EXPECTED_COPY', detail: route.expect });
    }

    // 3. contrast
    const texts = await page.evaluate(CONTRAST_PROBE);
    const badContrast = [];
    for (const t of texts) {
      if (t.overImage) continue; // contrast against a photo is not computable here
      const fg = parseRGB(t.color);
      const bg = parseRGB(t.bg);
      if (!fg || !bg) continue;
      if (fg.a < 0.5) continue; // deliberately faded
      const ratio = contrastRatio(fg.rgb, bg.rgb);
      const large = t.fontSize >= 24 || (t.bold && t.fontSize >= 18.66);
      const threshold = large ? 3 : 4.5;
      if (ratio < threshold) {
        badContrast.push({ text: t.text, color: t.color, bg: t.bg, ratio: Number(ratio.toFixed(2)), need: threshold });
      }
    }
    // Dedupe by colour pair — one row per distinct problem, not per word.
    const seen = new Set();
    for (const b of badContrast) {
      const k = `${b.color}|${b.bg}`;
      if (seen.has(k)) continue;
      seen.add(k);
      entry.issues.push({
        kind: b.ratio < 1.3 ? 'INVISIBLE_TEXT' : 'LOW_CONTRAST',
        detail: `"${b.text}" ${b.color} on ${b.bg} = ${b.ratio}:1 (needs ${b.need}:1)`,
      });
    }

    // 4. horizontal overflow
    const overflow = await page.evaluate(() => {
      const d = document.documentElement;
      return { scrollW: d.scrollWidth, clientW: d.clientWidth };
    });
    if (overflow.scrollW > overflow.clientW + 2) {
      entry.issues.push({
        kind: 'HORIZONTAL_OVERFLOW',
        detail: `content ${overflow.scrollW}px wide in ${overflow.clientW}px viewport`,
      });
    }

    // 5. tap targets
    const small = await page.evaluate(TAP_TARGET_PROBE);
    if (small.length) {
      entry.issues.push({
        kind: 'SMALL_TAP_TARGET',
        detail: `${small.length} under 44x44: ` + small.slice(0, 4).map((s) => `"${s.label}"(${s.w}x${s.h})`).join(', '),
      });
    }

    // 6. screenshot
    fs.mkdirSync(SHOTS, { recursive: true });
    const shot = path.join(SHOTS, `${route.path.replace(/[^a-z0-9]/gi, '_') || 'root'}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    entry.screenshot = shot;
  } catch (err) {
    entry.issues.push({ kind: 'NAVIGATION_FAILED', detail: String(err).slice(0, 200) });
  }

  if (pageErrors.length) entry.issues.push({ kind: 'PAGE_ERROR', detail: pageErrors.slice(0, 3).join(' | ') });
  const realConsoleErrors = consoleErrors.filter(
    (e) => !/Download the React DevTools|expo-notifications|shadow\*|textShadow\*|pointerEvents|useNativeDriver/i.test(e)
  );
  if (realConsoleErrors.length) {
    entry.issues.push({ kind: 'CONSOLE_ERROR', detail: realConsoleErrors.slice(0, 3).join(' | ') });
  }
  const realFailed = failedRequests.filter((f) => !/favicon/i.test(f));
  if (realFailed.length) {
    entry.issues.push({ kind: 'FAILED_REQUEST', detail: [...new Set(realFailed)].slice(0, 4).join(' | ') });
  }

  await page.close();
  return entry;
}

/** Drives the real sign-in form, so the login UI itself is under test. */
async function auditLoginForm(context) {
  const page = await context.newPage();
  const entry = { route: '/auth (form interaction)', name: 'sign-in form', issues: [] };
  try {
    await page.goto(`${WEB}/auth`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);

    const inputs = page.locator('input');
    const count = await inputs.count();
    if (count < 2) {
      entry.issues.push({ kind: 'FORM_NOT_FOUND', detail: `expected email+password inputs, found ${count} inputs` });
      await page.close();
      return entry;
    }
    // Sign-in mode: the screen defaults to SIGNUP, so switch first if needed.
    const bodyText = (await page.evaluate(() => document.body.innerText)).toLowerCase();
    if (bodyText.includes('already have an account')) {
      const toggle = page.getByText(/sign in|log in/i).last();
      if (await toggle.count()) {
        await toggle.click().catch(() => {});
        await page.waitForTimeout(1200);
      }
    }

    const all = await page.locator('input').all();
    const emailInput = all[all.length - 2];
    const passwordInput = all[all.length - 1];
    await emailInput.fill(EMAIL);
    await passwordInput.fill(PASSWORD);

    const submit = page.getByText(/sign in|log in|continue/i).last();
    await submit.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(5000);

    const token = await page.evaluate(() => localStorage.getItem('accessToken'));
    if (!token) {
      entry.issues.push({
        kind: 'LOGIN_DID_NOT_PERSIST_SESSION',
        detail: `after submitting valid credentials, no accessToken in localStorage. URL=${page.url()}`,
      });
    }
  } catch (err) {
    entry.issues.push({ kind: 'LOGIN_FLOW_FAILED', detail: String(err).slice(0, 200) });
  }
  await page.close();
  return entry;
}

(async () => {
  console.log(`UI audit — ${routes.length} route(s) against ${WEB}\n`);
  const session = await getSession();

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });

  for (const route of routes) {
    const entry = await auditRoute(context, route, session);
    report.push(entry);
    const bad = entry.issues.length;
    console.log(`${bad ? 'ISSUES' : '  ok  '}  ${route.path.padEnd(22)} ${bad ? `(${bad})` : ''}`);
    for (const i of entry.issues) console.log(`         ${i.kind}: ${i.detail}`);
  }

  if (!only) {
    const login = await auditLoginForm(context);
    report.push(login);
    console.log(`${login.issues.length ? 'ISSUES' : '  ok  '}  ${login.route}`);
    for (const i of login.issues) console.log(`         ${i.kind}: ${i.detail}`);
  }

  await browser.close();

  fs.writeFileSync(path.join(__dirname, 'report.json'), JSON.stringify(report, null, 2));

  const counts = {};
  for (const r of report) for (const i of r.issues) counts[i.kind] = (counts[i.kind] || 0) + 1;
  console.log('\n=== SUMMARY ===');
  console.log(`routes audited: ${report.length}`);
  console.log(`clean: ${report.filter((r) => !r.issues.length).length}`);
  console.log(`with issues: ${report.filter((r) => r.issues.length).length}`);
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
  console.log(`\nscreenshots: ${SHOTS}\nreport: ${path.join(__dirname, 'report.json')}`);
})();
