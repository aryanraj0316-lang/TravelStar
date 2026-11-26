const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const api = process.env.API_URL || 'http://localhost:5011/api/v1',
    web = process.env.WEB_URL || 'http://localhost:8088';
  for (const url of [api, web])
    if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname))
      throw Error('Use isolated localhost services for browser fixtures');
  const b = await chromium.launch({ headless: true, channel: 'chrome' });
  const errors = [];
  try {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(web + '/');
    await p.locator('.ts-shell[data-session-ready=true]').waitFor();
    await p.locator('.ts-menu-toggle').click();
    await p.locator('.ts-rail-cta a').click();
    const dialog = p.getByRole('dialog');
    await dialog.waitFor();
    assert.equal(new URL(p.url()).pathname, '/');
    await p.getByRole('button', { name: 'Maybe later', exact: true }).click();
    assert.equal(await dialog.isVisible(), false);
    await p.goto(web + '/create');
    await dialog.waitFor();
    assert.equal(await p.getByPlaceholder('e.g. 14500').isVisible(), false);
    await p.getByRole('button', { name: 'Sign in / Sign up', exact: true }).last().click();
    await p.waitForURL('**/auth?mode=LOGIN');
    const phone = '9' + String(Date.now()).slice(-9);
    let r = await fetch(api + '/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Responsive Form Test',
        email: phone + '@example.invalid',
        phoneNumber: phone,
        password: 'WebCheck-pass-2026!',
        termsAccepted: true,
      }),
    });
    assert.equal(r.status, 201);
    await p.getByPlaceholder('98765 43210').fill(phone);
    await p.locator('input[type=password]').fill('WebCheck-pass-2026!');
    await p.getByRole('button', { name: 'Log In', exact: true }).click();
    await p.waitForURL((u) => !u.pathname.includes('auth'));
    for (const width of [390, 320]) {
      await p.setViewportSize({ width, height: 844 });
      await p.goto(web + '/create');
      await p
        .getByPlaceholder('e.g. Royal Rajasthan Grand Expedition')
        .fill('A long trip title filled while testing responsive forms');
      await p.getByPlaceholder('e.g. Delhi, Agra, Jaipur, Udaipur').fill('Delhi, Agra, Jaipur');
      await p.getByPlaceholder('e.g. 14500').fill('14500');
      await p.getByPlaceholder('e.g. 12').fill('12');
      const budgetBox = await p.getByPlaceholder('e.g. 14500').boundingBox();
      const seatsBox = await p.getByPlaceholder('e.g. 12').boundingBox();
      assert(seatsBox.y > budgetBox.y + budgetBox.height, 'Pricing inputs must stack on narrow screens');
      assert.deepEqual(
        await p.locator('input').evaluateAll((es) =>
          es
            .filter((e) => {
              const r = e.getBoundingClientRect();
              return r.left < 0 || r.right > innerWidth + 1;
            })
            .map((e) => e.placeholder),
        ),
        [],
      );
      await p.getByRole('button', { name: 'START DATE *', exact: true }).click();
      await p.getByRole('button', { name: 'Confirm Date', exact: true }).waitFor();
      await p.setViewportSize({ width, height: 500 });
      const date = await p.getByRole('button', { name: 'Confirm Date', exact: true }).boundingBox();
      assert(date.y >= 0 && date.y + date.height <= 500, 'Calendar footer clipped');
      await p.getByRole('button', { name: 'Confirm Date', exact: true }).click();
      await p.setViewportSize({ width, height: 844 });
      await p.screenshot({ path: '.expo/create-filled-' + width + '.png' });
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      console.log('Filled Create and calendar passed at', width);
    }
    for (const route of ['/', '/search', '/chat', '/map', '/profile', '/bookings', '/budget-tracker', '/find-guides']) {
      await p.goto(web + route);
      await p.waitForTimeout(700);
      const text = await p.locator('body').innerText();
      assert(!/something went wrong|unmatched route/i.test(text), route + ' error screen');
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route + ' overflows');
      await p.screenshot({ path: '.expo/mobile-audit-' + route.replaceAll('/', '_') + '.png' });
      console.log('Narrow signed-in route passed:', route);
    }
    assert.deepEqual(errors, []);
    console.log('Guest sign-in gating, login, narrow form filling and calendar checks passed.');
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
