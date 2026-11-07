// Generate the public legal pages from the same copy the app displays.
const fs = require('node:fs');
const path = require('node:path');
const policy = require('../src/content/privacy-policy.json');
const output = path.resolve(__dirname, '../legal-pages');
const escape = (text) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paragraphs = (body) => body.split('\n\n').map((p) => `<p>${escape(p)}</p>`).join('\n');
function page(title, content) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${escape(title)} for the Yatrenzo mobile application.">
<title>${escape(title)}</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#202936;font:17px/1.75 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:880px;margin:32px auto;padding:40px;background:#fff;border-radius:16px}h1,h2{line-height:1.3;color:#122642}h1{font-size:2rem}h2{margin-top:36px;font-size:1.3rem}
a{color:#145ac4;overflow-wrap:anywhere}.date{color:#586575}nav{border-bottom:1px solid #dbe1ea;padding-bottom:20px}p{overflow-wrap:anywhere}a:focus-visible{outline:3px solid #145ac4;outline-offset:4px}
@media(max-width:600px){main{margin:0;padding:24px;border-radius:0}body{font-size:16px}}
</style></head><body><main><nav><a href="privacy.html">Privacy policy</a> · <a href="delete-account.html">Request account or data deletion</a></nav>
<h1>${escape(title)}</h1><p class="date">Last updated: ${escape(policy.updated)}</p>
${content}
<footer><p>Privacy contact: <a href="mailto:${policy.email}">${policy.email}</a></p></footer></main></body></html>\n`;
}
fs.mkdirSync(output, { recursive: true });
const sections = policy.sections.map((s) => `<section id="${s.id}"><h2>${escape(s.title)}</h2>\n${paragraphs(s.body)}</section>`).join('\n');
fs.writeFileSync(path.join(output, 'privacy.html'), page('Yatrenzo Privacy Policy', sections));
const deletion = policy.sections.find((s) => s.id === 'delete');
const retention = policy.sections.find((s) => s.id === 'retention');
fs.writeFileSync(path.join(output, 'delete-account.html'), page('Delete your Yatrenzo account or data',
  `<p>Yatrenzo is operated by Rakesh. Android publisher: Ankit Kumar Gupta (Eternity31).</p><p><a href="mailto:${policy.email}?subject=Yatrenzo%20account%20deletion%20request">Email a deletion request to Yatrenzo Support</a></p>` +
  paragraphs(deletion.body) + `<h2>Retention and limitations</h2>` + paragraphs(retention.body)));
fs.writeFileSync(path.join(output, '.nojekyll'), '');
console.log('Generated privacy.html and delete-account.html in legal-pages/');

fs.mkdirSync(path.join(__dirname, '..', 'backend', 'src', 'generated'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'backend', 'src', 'generated', 'public-pages.ts'), '// Generated public policy pages.\nexport const privacyPage = ' + JSON.stringify(fs.readFileSync(path.join(output, 'privacy.html'), 'utf8')) + ';\nexport const deleteAccountPage = ' + JSON.stringify(fs.readFileSync(path.join(output, 'delete-account.html'), 'utf8')) + ';\n');
