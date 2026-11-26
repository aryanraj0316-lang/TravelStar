const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  // This test creates accounts and uploads media: only run against an isolated local backend.
  const api = process.env.API_URL || 'http://localhost:5011/api/v1';
  const web = process.env.WEB_URL || 'http://localhost:8088';
  for (const url of [api, web]) if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Use isolated localhost services for browser fixtures');
  const phone = '9' + String(Date.now()).slice(-9);
  const register = await fetch(api + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Web Test Traveller', email: 'web-launch-' + phone + '@example.invalid', phoneNumber: phone, password: 'WebCheck-pass-2026!', termsAccepted: true }) });
  assert([201, 409].includes(register.status), 'Could not prepare isolated test account');
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(web + '/auth?mode=LOGIN');
    await page.getByPlaceholder('98765 43210').fill(phone);
    await page.locator('input[type="password"]').fill('WebCheck-pass-2026!');
    await page.getByRole('button', { name: 'Log In', exact: true }).click();
    await page.waitForURL(url => !url.pathname.includes('auth'), { timeout: 20000 });
    console.log('PASS real browser login');
    await page.goto(web + '/profile');
    await page.getByRole('button', { name: 'Payouts', exact: true }).waitFor();
    console.log('PASS web payouts navigation present');
    await page.getByRole('button', { name: /^Edit profile$/i }).click();
    const save = page.getByRole('button', { name: /Save Profile Changes/i });
    await save.waitFor();
    await page.waitForTimeout(400); // Let the sheet opening animation finish before measuring.
    let rect = await save.boundingBox();
    assert(rect && rect.y >= 0 && rect.y + rect.height <= 1000, 'Save button must be visible without scrolling');
    await page.getByPlaceholder('Enter full name').fill('Web Updated Traveller');
    const saved = page.waitForResponse(r => r.url().includes('/auth/profile') && r.request().method() === 'PUT');
    await save.click();
    assert.equal((await saved).status(), 200);
    console.log('PASS profile save and visible footer');
    for (const route of ['/', '/search', '/create', '/chat', '/map', '/group-organizer', '/payouts', '/receipts', '/safety-center', '/legal/privacy', '/legal/terms']) {
      await page.goto(web + route);
      await page.waitForTimeout(700);
      const text = await page.locator('body').innerText();
      assert(text.length > 40, route + ' is blank');
      assert(!/something went wrong|unmatched route/i.test(text), route + ' error screen');
      console.log('PASS route ' + route);
    }
    const peerPhone = '8' + String(Date.now()).slice(-9);
    const peerResponse = await fetch(api + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Web Chat Peer', email: peerPhone + '@example.invalid', phoneNumber: peerPhone, password: 'WebCheck-pass-2026!', termsAccepted: true }) });
    assert.equal(peerResponse.status, 201);
    const peer = (await peerResponse.json()).data;
    const token = await page.evaluate(() => localStorage.getItem('accessToken'));
    const dmResponse = await fetch(api + '/chats/dm', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ userId: peer.user.id }) });
    assert([200, 201].includes(dmResponse.status));
    const roomId = (await dmResponse.json()).data.chatRoomId;
    await page.goto(web + '/chat');
    await page.getByText('Web Chat Peer', { exact: true }).first().click();
    await page.getByPlaceholder('Message...').fill('Browser message reaches another account');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    let messages = [];
    for (let attempt = 0; attempt < 20; attempt++) {
      const response = await fetch(api + '/chats/' + roomId + '/messages', { headers: { Authorization: 'Bearer ' + peer.token } });
      messages = (await response.json()).data ?? [];
      if (messages.some(m => m.content === 'Browser message reaches another account')) break;
      await page.waitForTimeout(250);
    }
    assert(messages.some(m => m.content === 'Browser message reaches another account'), 'Sent browser message must reach the other account');
    console.log('PASS browser messaging across accounts');
    await page.goto(web + '/');
    await page.getByRole('button', { name: /Add Story/i }).first().waitFor();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Add Story/i }).first().click();
    await (await chooser).setFiles({ name: 'browser-story.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXYQAAAAASUVORK5CYII=', 'base64') });
    const published = page.waitForResponse(r => /\/api\/v1\/stories$/.test(r.url()) && r.request().method() === 'POST', { timeout: 20000 });
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    const response = await published;
    assert.equal(response.status(), 201, 'Browser image story must publish');
    const created = (await response.json()).data;
    assert(/^https?:/.test(created.mediaUrl), 'Published media must be remote');
    console.log('PASS browser image story upload and publish');
    await page.screenshot({ path: '.expo/web-browser-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(web + '/profile');
    await page.getByRole('button', { name: /^Edit profile$/i }).click();
    await save.waitFor();
    await page.waitForTimeout(400); // Let the sheet opening animation finish before measuring.
    rect = await save.boundingBox();
    assert(rect && rect.y >= 0 && rect.y + rect.height <= 844, 'Mobile browser Save button must be visible');
    console.log('PASS mobile browser save footer');
    assert.deepEqual(errors, [], 'Pages must hydrate and run without uncaught browser errors');
    fs.writeFileSync('.expo/web-browser-check.json', JSON.stringify({ passed: true, errors }, null, 2));
    console.log('BROWSER ERRORS', JSON.stringify(errors));
  } catch (error) {
    console.log('VISIBLE TEXT', (await page.locator('body').innerText()).slice(-3500));
    await page.screenshot({ path: '.expo/web-browser-failure.png', fullPage: true });
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
