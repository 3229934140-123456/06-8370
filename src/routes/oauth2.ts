import { Request, Response, Router } from 'express';
import { oauthService } from '../services/OAuthService';
import { generateState, generateCodeVerifier, generateCodeChallenge } from '../utils/pkce';

const router = Router();

router.get('/authorize', (req: Request, res: Response) => {
  const { client_id, redirect_uri, response_type, scope, code_challenge, code_challenge_method } =
    req.query;

  if (!client_id || !redirect_uri || !response_type) {
    return res.status(400).json({ error: '缺少必需参数' });
  }

  if (!oauthService.validateClient(client_id as string)) {
    return res.status(400).json({ error: '无效的客户端' });
  }

  if (response_type !== 'code') {
    return res.status(400).json({ error: '仅支持code授权模式' });
  }

  if (code_challenge && !code_challenge_method) {
    return res.status(400).json({ error: '缺少code_challenge_method' });
  }

  if (code_challenge_method && !['S256', 'plain'].includes(code_challenge_method as string)) {
    return res.status(400).json({ error: '不支持的code_challenge_method' });
  }

  const user = (req as any).user;
  if (!user) {
    return res.redirect(
      `/login?redirect=${encodeURIComponent('/oauth2/authorize?' + req.originalUrl.split('?')[1])}`
    );
  }

  res.render('authorize', {
    clientId: client_id,
    redirectUri: redirect_uri,
    scope: (scope as string)?.split(' ') || ['openid'],
    codeChallenge: code_challenge as string,
    codeChallengeMethod: code_challenge_method as string,
    user,
    title: '授权',
  });
});

router.post('/authorize', async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!user) {
    return res.redirect('/login');
  }

  const { client_id, redirect_uri, scope, code_challenge, code_challenge_method, action } = req.body;

  if (action === 'deny') {
    const denyUrl = new URL(redirect_uri);
    denyUrl.searchParams.set('error', 'access_denied');
    return res.redirect(denyUrl.toString());
  }

  if (!oauthService.validateClient(client_id)) {
    return res.status(400).json({ error: '无效的客户端' });
  }

  const state = generateState();
  const code = await oauthService.generateAuthCode(
    client_id,
    user.userId,
    redirect_uri,
    scope,
    code_challenge,
    code_challenge_method
  );

  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set('code', code);
  redirectUrl.searchParams.set('state', state);
  res.redirect(redirectUrl.toString());
});

router.post('/token', async (req: Request, res: Response) => {
  const { grant_type, code, redirect_uri, client_id, client_secret, code_verifier, refresh_token } =
    req.body;

  if (!client_id) {
    return res.status(400).json({ error: '缺少client_id' });
  }

  if (!oauthService.validateClient(client_id, client_secret)) {
    return res.status(400).json({ error: '无效的客户端凭证' });
  }

  if (grant_type === 'authorization_code') {
    if (!code || !redirect_uri) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const tokenResponse = await oauthService.exchangeCodeForToken(
      code,
      client_id,
      redirect_uri,
      code_verifier
    );

    if (!tokenResponse) {
      return res.status(400).json({ error: '无效的授权码或PKCE验证失败' });
    }

    return res.json(tokenResponse);
  }

  if (grant_type === 'refresh_token') {
    if (!refresh_token) {
      return res.status(400).json({ error: '缺少refresh_token' });
    }

    const tokenResponse = await oauthService.refreshToken(refresh_token, client_id);
    if (!tokenResponse) {
      return res.status(400).json({ error: '无效的刷新令牌' });
    }

    return res.json(tokenResponse);
  }

  res.status(400).json({ error: '不支持的grant_type' });
});

export default router;
