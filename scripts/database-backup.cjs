const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

function encryptDump(dump, key) {
  if (key.length !== 32) throw new Error('Backup key must contain 32 bytes');
  if (dump.subarray(0, 5).toString() !== 'PGDMP') throw new Error('Not a PostgreSQL custom archive');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(dump), cipher.final()]);
  return Buffer.concat([Buffer.from('YTZB1'), iv, cipher.getAuthTag(), body]);
}

function decryptDump(archive, key) {
  if (archive.length < 34 || archive.subarray(0, 5).toString() !== 'YTZB1') throw new Error('Invalid encrypted backup');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, archive.subarray(5, 17));
  decipher.setAuthTag(archive.subarray(17, 33));
  return Buffer.concat([decipher.update(archive.subarray(33)), decipher.final()]);
}

function main() {
  const raw = process.env.AIVEN_BACKUP_DATABASE_URL;
  const key = Buffer.from(process.env.AIVEN_BACKUP_KEY_BASE64 || '', 'base64');
  if (!raw || key.length !== 32) throw new Error('Missing database URI or 32-byte backup encryption key');
  const u = new URL(raw);
  if (!u.hostname.endsWith('.aivencloud.com') || !u.password || u.searchParams.get('sslmode') !== 'require') throw new Error('Expected a TLS-enabled Aiven database URI');
  const env = { ...process.env, PGHOST: u.hostname, PGPORT: u.port || '5432', PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password), PGDATABASE: decodeURIComponent(u.pathname.slice(1)), PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '30' };
  // pg_dump receives credentials only through its environment, never argv.
  delete env.AIVEN_BACKUP_KEY_BASE64;
  delete env.AIVEN_BACKUP_DATABASE_URL;
  const dumpArgs = ['-Fc', '--no-owner', '--no-privileges', '--schema=public', '-w'];
  const docker = process.argv.includes('--docker');
  const command = docker ? 'docker' : process.env.PG_DUMP_BIN || 'pg_dump';
  const args = docker ? ['run', '--rm', ...['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGSSLMODE', 'PGCONNECT_TIMEOUT'].flatMap(k => ['-e', k]), 'postgres:18-bookworm', 'pg_dump', ...dumpArgs] : dumpArgs;
  const result = spawnSync(command, args, { env, timeout: 180000, maxBuffer: 512 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Database backup failed (exit ${result.status}, ${result.error?.code || 'pg_dump error'}); no archive uploaded`);
  const encrypted = encryptDump(result.stdout, key);
  const decrypted = decryptDump(encrypted, key);
  const digest = b => crypto.createHash('sha256').update(b).digest();
  if (!crypto.timingSafeEqual(digest(result.stdout), digest(decrypted))) throw new Error('Backup integrity verification failed');
  const dir = path.resolve(process.env.BACKUP_OUTPUT_DIR || '.backup-output');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'database-backup.enc'), encrypted, { mode: 0o600 });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), revision: process.env.GITHUB_SHA || null, encryption: 'AES-256-GCM', format: 'YTZB1: magic(5), nonce(12), tag(16), ciphertext', bytes: encrypted.length, sha256: crypto.createHash('sha256').update(encrypted).digest('hex') }, null, 2));
  console.log(`Encrypted database backup verified (${encrypted.length} bytes).`);
}

module.exports = { encryptDump, decryptDump };
if (require.main === module) {
  try { main(); } catch (e) { console.error(e.message.startsWith('Database backup') || e.message.startsWith('Missing') || e.message.startsWith('Expected') ? e.message : 'Backup validation failed; no credentials or data were logged'); process.exitCode = 1; }
}
