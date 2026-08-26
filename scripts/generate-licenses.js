#!/usr/bin/env node
// Generates src/assets/licenses.json — the real third-party license list
// shown on the app's "Third-Party Licenses" screen (REMEDIATION.md §8.20).
// Run via `npm run licenses:generate`. Re-run this before every release so
// the shipped list matches package.json, and check the regenerated file
// into git — there's no CI license-generation step yet (that's Phase 13).
//
// Uses license-checker-rseidelsohn (the maintained fork; the original
// license-checker package is unmaintained and fails to run under current
// Node due to a broken transitive dependency).
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Not under src/assets/ — that path is claimed by the @/assets/* tsconfig
// alias, which points at the top-level assets/ folder (app icons/splash
// images for app.json), not src/assets/. src/data/ avoids the collision.
const OUT_PATH = path.join(__dirname, '..', 'src', 'data', 'licenses.json');

function run() {
  // No user input reaches this command — it's a fixed literal string, run
  // only by a developer locally, so shell interpolation isn't a concern.
  const raw = execSync(
    'npx --yes license-checker-rseidelsohn --json --production --excludePrivatePackages',
    { cwd: path.join(__dirname, '..'), maxBuffer: 1024 * 1024 * 64, encoding: 'utf8' }
  );

  const data = JSON.parse(raw);

  const entries = Object.entries(data).map(([nameAtVersion, info]) => {
    const lastAt = nameAtVersion.lastIndexOf('@');
    const name = nameAtVersion.slice(0, lastAt);
    const version = nameAtVersion.slice(lastAt + 1);
    return {
      name,
      version,
      license: Array.isArray(info.licenses) ? info.licenses.join(', ') : (info.licenses || 'UNKNOWN'),
      repository: info.repository || null,
      publisher: info.publisher || null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2) + '\n');
  console.log(`Wrote ${entries.length} license entries to ${path.relative(process.cwd(), OUT_PATH)}`);
}

run();
