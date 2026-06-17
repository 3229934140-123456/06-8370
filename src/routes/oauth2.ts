import { Request, Response, Router } from 'express';
import { oauthService } from '../services/OAuthService';
import { clientService } from '../services/ClientService';
import { userService } from '../services/UserService';
import { generateState } from '../utils/pkce';
import { getScopeDescriptions } from '../config/scopes';
import { getCurrentUser } from '../middleware/auth';

const router = Router();

async function buildRedirectError(redirectUri: string, error: string, description?: string, state?: string): Promise<string> {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  if (description) url.searchParams.set('error_description', description);
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

router.get('/authorize', async (req: Request, res: Response) => {
  const { client_id, redirect_uri, response_type, scope, code_challenge, code_challenge_method, state } =
    req.query;

  if (!client_id || !redirect_uri || !response_type) {
    return res.status(400).json({ error: '缺少必需参数' });
  }

  const client = await oauthService.validateClient(client_id as string);
  if (!client) {
    return res.status(400).json({ error: '无效的客户端' });
  }

  const redirectUri = redirect_uri as string;
  if (!await oauthService.validateRedirectUri(client_id as string, redirectUri)) {
    return res.status(400).json({
      error: 'invalid_redirect_uri',
      error_description: '回调地址未在白名单中',
    });
  }

  if (response_type !== 'code') {
    const errUrl = await buildRedirectError(redirectUri, 'unsupported_response_type', '仅支持code授权模式', state as string);
    return res.redirect(errUrl);
  }

  if (code_challenge && !code_challenge_method) {
    const errUrl = await buildRedirectError(redirectUri, 'invalid_request', '缺少code_challenge_method', state as string);
    return res.redirect(errUrl);
  }

  if (code_challenge_method && !['S256', 'plain'].includes(code_challenge_method as string)) {
    const errUrl = await buildRedirectError(redirectUri, 'invalid_request', '不支持的code_challenge_method', state as string);
    return res.redirect(errUrl);
  }

  const scopes = (scope as string)?.split(' ') || ['openid'];
  if (!await oauthService.validateScopes(client_id as string, scopes)) {
    const errUrl = await buildRedirectError(redirectUri, 'invalid_scope', '请求的scope不在允许范围内', state as string);
    return res.redirect(errUrl);
  }

  const user = getCurrentUser(req);
  if (!user) {
    if (req.session) {
      req.session.pendingAuthorize = {
        client_id: client_id as string,
        redirect_uri: redirectUri,
        scope: scope as string || 'openid',
        code_challenge: (code_challenge as string) || '',
        code_challenge_method: (code_challenge_method as string) || '',
      };
    }
    return res.redirect('/login');
  }

  if (client.requireConsent) {
    const consentGiven = await oauthService.isConsentGiven(client_id as string, user.userId, scopes);
    if (consentGiven) {
      const code = await oauthService.generateAuthCode(
        client_id as string,
        user.userId,
        redirectUri,
        scopes,
        code_challenge as string,
        code_challenge_method as string
      );
      const redirectUrl = new URL(redirectUri);
      redirectUrl.searchParams.set('code', code);
      if (state) redirectUrl.searchParams.set('state', state as string);
      return res.redirect(redirectUrl.toString());
    }
  }

  const fullUser = await userService.findById(user.userId);
  const scopeDescriptions = getScopeDescriptions(scopes);

  res.render('authorize', {
    client,
    redirectUri,
    scope: scopes,
    scopeDescriptions,
    codeChallenge: code_challenge as string,
    codeChallengeMethod: code_challenge_method as string,
    state: state as string,
    user: fullUser,
    pkceEnabled: !!code_challenge,
    title: '授权',
  });
});

router.post('/authorize', async (req: Request, res: Response) => {
  const user = getCurrentUser(req);
  if (!user) {
    return res.redirect('/login');
  }

  const { client_id, redirect_uri, scope, code_challenge, code_challenge_method, action, state } = req.body;
  const scopes = scope ? scope.split(' ') : ['openid'];

  const client = await oauthService.validateClient(client_id as string);
  if (!client) {
    return res.status(400).json({ error: '无效的客户端' });
  }

  if (!await oauthService.validateRedirectUri(client_id as string, redirect_uri as string)) {
    return res.status(400).json({ error: '回调地址未在白名单中' });
  }

  if (action === 'deny') {
    const errUrl = await buildRedirectError(
      redirect_uri as string,
      'access_denied',
      '用户拒绝授权',
      state as string
    );
    return res.redirect(errUrl);
  }

  const code = await oauthService.generateAuthCode(
    client_id as string,
    user.userId,
    redirect_uri as string,
    scopes,
    code_challenge || undefined,
    code_challenge_method || undefined
  );

  if (client.requireConsent) {
    await oauthService.recordConsent(client_id as string, user.userId, scopes);
  }

  const redirectUrl = new URL(redirect_uri as string);
  redirectUrl.searchParams.set('code', code);
  if (state) redirectUrl.searchParams.set('state', state as string);
  res.redirect(redirectUrl.toString());
});

router.post('/token', async (req: Request, res: Response) => {
  const { grant_type, code, redirect_uri, client_id, client_secret, code_verifier, refresh_token } =
    req.body;

  if (!client_id) {
    return res.status(400).json({ error: 'invalid_request', error_description: '缺少client_id' });
  }

  const client = await oauthService.validateClient(client_id as string, client_secret as string);
  if (!client) {
    return res.status(400).json({ error: 'invalid_client', error_description: '无效的客户端凭证' });
  }

  if (grant_type === 'authorization_code') {
    if (!code || !redirect_uri) {
      return res.status(400).json({ error: 'invalid_request', error_description: '缺少必要参数' });
    }

    if (!client.isValidRedirectUri(redirect_uri as string)) {
      return res.status(400).json({ error: 'invalid_grant', error_description: '回调地址不匹配' });
    }

    const tokenResponse = await oauthService.exchangeCodeForToken(
      code as string,
      client_id as string,
      redirect_uri as string,
      code_verifier as string
    );

    if (!tokenResponse) {
      return res.status(400).json({ error: 'invalid_grant', error_description: '无效的授权码或PKCE验证失败' });
    }

    return res.json(tokenResponse);
  }

  if (grant_type === 'refresh_token') {
    if (!refresh_token) {
      return res.status(400).json({ error: 'invalid_request', error_description: '缺少refresh_token' });
    }

    const tokenResponse = await oauthService.refreshToken(refresh_token as string, client_id as string);
    if (!tokenResponse) {
      return res.status(400).json({ error: 'invalid_grant', error_description: '无效的刷新令牌' });
    }

    return res.json(tokenResponse);
  }

  res.status(400).json({ error: 'unsupported_grant_type' });
});

export default router;
