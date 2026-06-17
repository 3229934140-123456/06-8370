import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_ACCESS_EXPIRES = '1h';
const JWT_REFRESH_EXPIRES = '7d';

export interface JWTPayload {
  userId: string;
  email?: string;
}

export function signAccessToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_ACCESS_EXPIRES });
}

export function signRefreshToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRES });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
