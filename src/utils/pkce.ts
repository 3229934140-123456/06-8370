import * as crypto from 'crypto';

export function generateCodeVerifier(length: number = 43): string {
  const verifier = crypto
    .randomBytes(length)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
    .substring(0, length);
  return verifier;
}

export function generateCodeChallenge(verifier: string, method: 'S256' | 'plain' = 'S256'): string {
  if (method === 'plain') {
    return verifier;
  }
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return hash
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function verifyCodeChallenge(
  verifier: string,
  challenge: string,
  method: 'S256' | 'plain' = 'S256'
): boolean {
  const expected = generateCodeChallenge(verifier, method);
  return expected === challenge;
}

export function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function generateAuthCode(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}
