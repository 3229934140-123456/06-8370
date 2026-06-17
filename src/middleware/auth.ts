import { Request, Response, NextFunction } from 'express';
import { verifyToken, JWTPayload } from '../utils/jwt';

declare module 'express-session' {
  interface SessionData {
    user?: JWTPayload;
    pendingOAuth?: {
      provider: string;
      userInfo: any;
    };
    pendingAuthorize?: {
      client_id: string;
      redirect_uri: string;
      scope: string;
      code_challenge: string;
      code_challenge_method: string;
      state?: string;
    };
    oauthState?: string;
    oauthCodeVerifier?: string;
    oauthBindUserId?: string;
    oauthReauthorizeProvider?: string;
  }
}

export function authRequired(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.access_token) {
    token = req.cookies.access_token;
  }

  if (!token && req.session?.user) {
    (req as any).user = req.session.user;
    return next();
  }

  if (!token) {
    if (req.headers.accept?.includes('text/html')) {
      return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
    }
    return res.status(401).json({ error: '未授权访问' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    if (req.headers.accept?.includes('text/html')) {
      return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
    }
    return res.status(401).json({ error: 'Token无效或已过期' });
  }

  (req as any).user = payload;
  if (req.session) {
    req.session.user = payload;
  }
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.access_token) {
    token = req.cookies.access_token;
  }

  if (!token && req.session?.user) {
    (req as any).user = req.session.user;
    return next();
  }

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      (req as any).user = payload;
      if (req.session) {
        req.session.user = payload;
      }
    }
  }
  next();
}

export function getCurrentUser(req: Request): JWTPayload | null {
  return (req as any).user || null;
}
