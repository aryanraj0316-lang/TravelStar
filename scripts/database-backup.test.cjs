const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { encryptDump, decryptDump } = require('./database-backup.cjs');

test('authenticated backup round trip, with a fresh nonce each time', () => {
  const key = crypto.randomBytes(32);
  const dump = Buffer.concat([Buffer.from('PGDMP'), crypto.randomBytes(2000)]);
  const a = encryptDump(dump, key);
  const b = encryptDump(dump, key);
  assert.deepEqual(decryptDump(a, key), dump);
  assert.notDeepEqual(a, b);
  assert.equal(a.includes(dump), false);
});

test('rejects tampering and the wrong recovery key', () => {
  const key = crypto.randomBytes(32);
  const a = encryptDump(Buffer.from('PGDMPprivate database content'), key);
  assert.throws(() => decryptDump(a, crypto.randomBytes(32)));
  a[a.length - 1] ^= 1;
  assert.throws(() => decryptDump(a, key));
});

test('rejects incomplete input and invalid keys', () => {
  assert.throws(() => encryptDump(Buffer.from('PGDMP'), Buffer.alloc(1)));
  assert.throws(() => encryptDump(Buffer.from('failed dump'), crypto.randomBytes(32)));
  assert.throws(() => decryptDump(Buffer.alloc(5), crypto.randomBytes(32)));
});
