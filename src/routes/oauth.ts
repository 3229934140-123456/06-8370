import { Request, Response, Router } from 'express';
import { getProvider, isValidProvider, getProviderDisplayName } from '../providers';
import { oauthAccountService, OAuthUserInfo } from '../services/OAuthAccountService';
import { userService } from '../services/UserService';
import { oauthService } from '../services/OAuthService';
import { generateState, generateCodeVerifier, generateCodeChallenge } from '../utils/pkce';
import { signAccessToken } from '../utils/jwt';
import { authRequired, getCurrentUser } from '../middleware/auth';
import { ProviderType } from '../entities/OAuthAccount';

const router = Router();

router.get('/:provider', (req: Request, res: Response) => {
  const { provider } = req.params;
  if (!isValidProvider(provider)) {
    return res.status(400).json({ error: '不支持的身份提供商' });
  }

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  if (req.session) {
    req.session.oauthState = state;
    req.session.oauthCodeVerifier = codeVerifier;
    req.session.oauthClientId = req.query.client_id as string;
    req.session.oauthRedirectUri = req.query.redirect_uri as string;
    req.session.oauthScope = (req.query.scope as string)?.split(' ') || ['openid'];
  }

  const oauthProvider = getProvider(provider);
  const authUrl = oauthProvider!.getAuthorizationUrl(state, codeChallenge, 'S256');
  res.redirect(authUrl);
});

router.get('/:provider/callback', async (req: Request, res: Response) => {
  const { provider } = req.params;
  const { code, state, error, complete_registration, user_id } = req.query;

  if (error) {
    return res.redirect(`/login?error=${encodeURIComponent('授权被拒绝或失败')}`);
  }

  if (!isValidProvider(provider)) {
    return res.status(400).json({ error: '不支持的身份提供商' });
  }

  if (complete_registration && user_id) {
    const pendingOAuth = req.session?.pendingOAuth;
    if (!pendingOAuth) {
      return res.redirect('/login?error=会话已过期，请重新登录');
    }
    try {
      await oauthAccountService.createOrUpdate(
        user_id as string,
        provider,
        pendingOAuth.userInfo as OAuthUserInfo
      );
      const user = await userService.findById(user_id as string);
      if (!user) {
        return res.redirect('/login?error=用户不存在');
      }

      const token = signAccessToken({ userId: user.id, email: user.email });
      res.cookie('access_token', token, {
        httpOnly: true,
        maxAge: 3600 * 1000,
        sameSite: 'lax',
      });
      if (req.session) {
        req.session.user = { userId: user.id, email: user.email };
        delete req.session.pendingOAuth;
      }
      return res.redirect('/');
    } catch (err) {
      console.error('Complete registration error:', err);
      return res.redirect('/login?error=账号绑定失败');
    }
  }

  if (req.session?.oauthState && req.session.oauthState !== state) {
    return res.redirect('/login?error=无效的state参数');
  }

  if (!code) {
    return res.redirect('/login?error=缺少授权码');
  }

  try {
    const oauthProvider = getProvider(provider)!;
    const userInfo = await oauthProvider.exchangeCodeForToken(code as string);

    if (!userInfo.email && !userInfo.phone) {
      if (req.session) {
        req.session.pendingOAuth = {
          provider,
          userInfo,
        };
      }
      return res.redirect('/register');
    }

    const result = await oauthAccountService.handleOAuthLogin(provider, userInfo);

    if (result.needsRegistration) {
      if (req.session) {
        req.session.pendingOAuth = {
          provider,
          userInfo,
        };
      }
      return res.redirect('/register');
    }

    const token = signAccessToken({
      userId: result.user.id,
      email: result.user.email,
    });
    res.cookie('access_token', token, {
      httpOnly: true,
      maxAge: 3600 * 1000,
      sameSite: 'lax',
    });
    if (req.session) {
      req.session.user = { userId: result.user.id, email: result.user.email };
      delete req.session.oauthState;
      delete req.session.oauthCodeVerifier;
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

  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: '缺少授权码' });
  }

  try {
    const oauthProvider = getProvider(provider)!;
    const userInfo = await oauthProvider.exchangeCodeForToken(code);

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
