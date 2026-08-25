import argon2 from 'argon2';

// A small top-common-password list. This is deliberately short and inlined —
// swapping in zxcvbn or a full top-10k list is a drop-in replacement here.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '123456789', '1234567890',
  'qwertyuiop', 'letmein123', 'welcome123', 'admin12345', 'iloveyou1',
  'sunshine1', 'princess1', 'football1', 'monkey1234', 'abc123456',
  'passw0rd', 'p@ssw0rd', 'qwerty1234', '111111111', 'changeme123',
]);

export const MIN_PASSWORD_LENGTH = 10;

export function validatePasswordStrength(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'That password is too common. Please choose something less guessable.';
  }
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // A malformed/legacy hash must not authenticate anyone.
    return false;
  }
}
