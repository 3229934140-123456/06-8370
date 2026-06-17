import { Request, Response, Router } from 'express';
import { getProvider, isValidProvider, getProviderDisplayName } from '../providers';
import { oauthAccountService, OAuthUserInfo } from '../services/OAuthAccountService';
import { userService } from '../services/UserService';
import { signAccessToken } from '../utils/jwt';
import { generateCodeVerifier, generateCodeChallenge } from '../utils/pkce';
import { authRequired, getCurrentUser } from '../middleware/auth';
import { ProviderType } from '../entities/OAuthAccount';

const router = Router();

function generateState(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

router.get('/:provider', (req: Request, res: Response) => {
  const { provider } = req.params;
  if (!isValidProvider(provider)) {
    return res.status(400).json({ error: '不支持的身份提供商' });
  }

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const codeChallengeMethod = 'S256';

  if (req.session) {
    req.session.oauthState = state;
    req.session.oauthCodeVerifier = codeVerifier;
  }

  const oauthProvider = getProvider(provider)!;
  const authUrl = oauthProvider.getAuthorizationUrl(state, codeChallenge, codeChallengeMethod);
  res.redirect(authUrl);
});

router.get('/:provider/callback', async (req: Request, res: Response) => {
  const { provider } = req.params;
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`/login?error=${encodeURIComponent('授权被拒绝或失败')}`);
  }

  if (!isValidProvider(provider)) {
    return res.status(400).json({ error: '不支持的身份提供商' });
  }

  if (req.session?.oauthState && req.session.oauthState !== state) {
    return res.redirect('/login?error=' + encodeURIComponent('无效的state参数'));
  }

  if (!code) {
    return res.redirect('/login?error=' + encodeURIComponent('缺少授权码'));
  }

  const codeVerifier = req.session?.oauthCodeVerifier;
  const bindUserId = req.session?.oauthBindUserId;
  const reauthorizeProvider = req.session?.oauthReauthorizeProvider;

  try {
    const oauthProvider = getProvider(provider)!;
    const userInfo = await oauthProvider.exchangeCodeForToken(code as string, codeVerifier);

    if (req.session) {
      delete req.session.oauthState;
      delete req.session.oauthCodeVerifier;
      delete req.session.oauthReauthorizeProvider;
    }

    if (reauthorizeProvider === provider) {
      if (!bindUserId) {
        return res.redirect('/profile?error=' + encodeURIComponent('会话已过期，请重新操作'));
      }
      delete req.session!.oauthBindUserId;

      const existingAccount = await oauthAccountService.findByProvider(provider, userInfo.providerUserId);
      if (existingAccount && existingAccount.userId !== bindUserId) {
        return res.redirect('/profile?error=' + encodeURIComponent('该三方账号已被其他用户绑定'));
      }

      await oauthAccountService.createOrUpdate(bindUserId, provider, userInfo);
      return res.redirect('/profile?success=' + encodeURIComponent(`${getProviderDisplayName(provider)}重新授权成功`));
    }

    if (bindUserId) {
      delete req.session!.oauthBindUserId;

      const existingAccount = await oauthAccountService.findByProvider(provider, userInfo.providerUserId);
      if (existingAccount && existingAccount.userId !== bindUserId) {
        return res.redirect('/profile?error=' + encodeURIComponent('该三方账号已被其他用户绑定'));
      }

      await oauthAccountService.createOrUpdate(bindUserId, provider, userInfo);
      return res.redirect('/profile?success=' + encodeURIComponent(`${getProviderDisplayName(provider)}绑定成功`));
    }

    if (!userInfo.email && !userInfo.phone) {
      if (req.session) {
        req.session.pendingOAuth = { provider, userInfo };
      }
      return res.redirect('/register');
    }

    const result = await oauthAccountService.handleOAuthLogin(provider, userInfo);

    if (result.needsRegistration) {
      if (req.session) {
        req.session.pendingOAuth = { provider, userInfo };
      }
      return res.redirect('/register');
    }

    const token = signAccessToken({ userId: result.user.id, email: result.user.email });
    res.cookie('access_token', token, {
      httpOnly: true,
      maxAge: 3600 * 1000,
      sameSite: 'lax',
    });
    if (req.session) {
      req.session.user = { userId: result.user.id, email: result.user.email };
    }

    if (req.session?.pendingAuthorize) {
      const pa = req.session.pendingAuthorize;
      delete req.session.pendingAuthorize;
      const params = new URLSearchParams({
        client_id: pa.client_id,
        redirect_uri: pa.redirect_uri,
        response_type: 'code',
        scope: pa.scope,
      });
      if (pa.code_challenge) {
        params.set('code_challenge', pa.code_challenge);
        params.set('code_challenge_method', pa.code_challenge_method);
      }
      return res.redirect(`/oauth2/authorize?${params.toString()}`);
    }

    const successMsg = result.merged
      ? `已自动合并到现有账号，${getProviderDisplayName(provider)}登录成功`
      : `${getProviderDisplayName(provider)}登录成功`;

    res.redirect(`/?success=${encodeURIComponent(successMsg)}`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect('/login?error=登录失败，请稍后重试');
  }
});

router.post('/:provider/bind', authRequired, async (req: Request, res: Response) => {
  const { provider } = req.params;
  if (!isValidProvider(provider)) {
    return res.status(400).json({ error: '不支持的身份提供商' });
  }

  const user = getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ error: '未登录' });
  }

  const { code, code_verifier } = req.body;
  if (!code) {
    return res.status(400).json({ error: '缺少授权码' });
  }

  try {
    const oauthProvider = getProvider(provider)!;
    const userInfo = await oauthProvider.exchangeCodeForToken(code, code_verifier);

    const existingAccount = await oauthAccountService.findByProvider(provider, userInfo.providerUserId);
    if (existingAccount && existingAccount.userId !== user.userId) {
      return res.status(400).json({ error: '该账号已被其他用户绑定' });
    }

    await oauthAccountService.createOrUpdate(user.userId, provider, userInfo);
    res.json({ success: true, message: `${getProviderDisplayName(provider)}绑定成功` });
  } catch (err) {
    console.error('Bind error:', err);
    res.status(500).json({ error: '绑定失败' });
  }
});

router.post('/:provider/unbind', authRequired, async (req: Request, res: Response) => {
  const { provider } = req.params;
  if (!isValidProvider(provider)) {
    return res.status(400).json({ error: '不支持的身份提供商' });
  }

  const user = getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ error: '未登录' });
  }

  try {
    await oauthAccountService.unbind(user.userId, provider as ProviderType);
    res.json({ success: true, message: `${getProviderDisplayName(provider)}已解绑` });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '解绑失败' });
  }
});

export default router;
