const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const web = process.env.WEB_URL || 'http://localhost:8088';
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await p.goto(web + '/?pullCheck=' + Date.now());
    await p.locator('.ts-shell[data-session-ready=true]').waitFor();
    const cdp = await p.context().newCDPSession(p);
    const touch = async (type, x, y) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await touch('touchStart', 150, 190);
    await touch('touchMove', 150, 250);
    await p.getByRole('status', { name: 'Pull to refresh', exact: true }).waitFor();
    await touch('touchEnd');
    assert.equal(await p.locator('.ts-pull-refresh').count(), 0);
    await touch('touchStart', 150, 190);
    await touch('touchMove', 50, 200);
    await touch('touchEnd');
    assert.equal(await p.locator('.ts-pull-refresh').count(), 0);
    await p.reload();
    await p.locator('.ts-shell[data-session-ready=true]').waitFor();
    await p.waitForTimeout(500);
    await touch('touchStart', 100, 260);
    for (let y = 280; y <= 440; y += 20) {
      await touch('touchMove', 100, y);
      await p.waitForTimeout(25);
    }
    await p.getByRole('status', { name: 'Release to refresh', exact: true }).waitFor();
    assert(await p.locator('.ts-shell').evaluate((el) => getComputedStyle(el).transform !== 'none'));
    const reloaded = p.waitForNavigation({ waitUntil: 'domcontentloaded' });
    await touch('touchEnd');
    await p.locator('.ts-refresh-spinner.is-spinning').waitFor();
    assert.equal(await p.locator('.ts-pull-refresh').innerText(), '');
    await p.screenshot({ path: '.expo/refresh-spinner.png' });
    await reloaded;
    await p.locator('.ts-shell[data-session-ready=true]').waitFor();
    await p.evaluate(() => {
      const s = [...document.querySelectorAll('main div')].find(
        (e) => e.scrollHeight > e.clientHeight + 200 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY),
      );
      if (!s) throw Error('Page scroll container missing');
      s.scrollTop = 200;
    });
    await touch('touchStart', 150, 190);
    await touch('touchMove', 150, 360);
    await touch('touchEnd');
    assert.equal(await p.locator('.ts-pull-refresh').count(), 0);
    console.log(
      'Touch pull refresh passed: short pull cancels, horizontal swipe ignored, full pull reloads, scrolled page ignored.',
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
