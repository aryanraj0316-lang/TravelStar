const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || 'dist');
const expected = process.env.EXPO_PUBLIC_API_URL;
if (!expected || new URL(expected).protocol !== 'https:' || new URL(expected).pathname !== '/') {
  throw new Error('Production web builds need EXPO_PUBLIC_API_URL set to the HTTPS backend origin');
}
for (const page of ['index.html', 'auth.html', 'profile.html', 'chat.html', 'map.html', 'legal/privacy.html', 'legal/terms.html']) {
  if (!fs.existsSync(path.join(root, page))) throw new Error('Missing exported page: ' + page);
}
const bundleDir = path.join(root, '_expo/static/js/web');
const bundles = fs.readdirSync(bundleDir).filter(file => file.endsWith('.js')).map(file => fs.readFileSync(path.join(bundleDir, file), 'utf8'));
if (!bundles.some(text => text.includes(expected))) throw new Error('The release bundle does not contain the configured backend URL');
if (bundles.some(text => text.includes('http://localhost:5011'))) throw new Error('An isolated test backend URL was included in the release');
console.log('Production web export verified against ' + expected);
