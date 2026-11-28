const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { chromium } = require('playwright');

// Uses the actual shared web wrapper and the provider's test-bank page.
module.exports = async function checkout({ key, orderId }) {
  assert(key.startsWith('rzp_test_'), 'Only sandbox checkout is allowed');
  const server = http.createServer((req, res) => res.end('<html><body>Sandbox validation</body></html>'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const source = fs.readFileSync(path.resolve(__dirname, '../src/services/razorpay.ts'), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    await page.addScriptTag({ content: 'window.exports={};window.require=()=>({Platform:{OS:"web"}});' + js });
    const options = { key, order_id: orderId, amount: 100, currency: 'INR', name: 'Yatrenzo Sandbox', description: 'Test only', prefill: { name: 'Sandbox Tester', email: 'sandbox@example.com', contact: '9000090000' } };
    await page.evaluate(options => {
      window.checkoutResult = null;
      window.exports.openRazorpayCheckout(options).then(data => window.checkoutResult = { data }, error => window.checkoutResult = { error: error.message });
    }, options);
    const frame = page.frameLocator('iframe.razorpay-checkout-frame');
    await frame.getByText('Netbanking', { exact: true }).waitFor();
    const contact = frame.getByPlaceholder('Mobile number');
    if (await contact.isVisible()) {
      await contact.fill('9000090000');
      await frame.getByRole('button', { name: 'Continue', exact: true }).click();
    }
    await frame.getByText('Netbanking', { exact: true }).click();
    const popupPromise = page.waitForEvent('popup');
    await frame.getByText('HDFC Bank', { exact: true }).first().click();
    const bank = await popupPromise;
    await bank.getByRole('button', { name: 'Success', exact: true }).click();
    await page.waitForFunction(() => window.checkoutResult !== null, { timeout: 45000 });
    const result = await page.evaluate(() => window.checkoutResult);
    assert(!result.error, 'Sandbox checkout did not complete');
    assert.equal(result.data.razorpay_order_id, orderId);
    return result.data;
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
};
