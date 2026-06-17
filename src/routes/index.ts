import { Request, Response, Router } from 'express';
import { optionalAuth, getCurrentUser } from '../middleware/auth';
import { userService } from '../services/UserService';
import { oauthAccountService } from '../services/OAuthAccountService';
import { getProviderDisplayName, getProvider, isValidProvider } from '../providers';
import { ProviderType, OAuthAccount } from '../entities/OAuthAccount';

const router = Router();

router.get('/', optionalAuth, async (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  const success = req.query.success as string;
  let user = null;
  let oauthAccounts: OAuthAccount[] = [];

  if (currentUser) {
    user = await userService.findById(currentUser.userId);
    if (user) {
      oauthAccounts = await oauthAccountService.findByUser(user.id);
    }
  }

  const allProviders: { type: ProviderType; name: string }[] = [];
  (['github', 'google', 'wechat'] as ProviderType[]).forEach((p) => {
    allProviders.push({ type: p, name: getProviderDisplayName(p) });
  });

  res.render('index', {
    user,
    oauthAccounts: oauthAccounts.map((a) => ({
      ...a,
      displayName: getProviderDisplayName(a.provider),
    })),
    allProviders,
    success,
    title: 'OAuth2聚合认证服务',
  });
});

router.get('/callback', (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  res.render('callback', {
    code,
    state,
    error,
    title: 'OAuth回调',
  });
});

router.post('/api/refresh-tokens', optionalAuth, async (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: '未登录' });
  }

  const accounts = await oauthAccountService.findByUser(currentUser.userId);
  const results: Array<{ provider: string; success: boolean; error?: string }> = [];

  for (const account of accounts) {
    if (!isValidProvider(account.provider)) continue;
    if (!account.refreshToken) {
      results.push({ provider: account.provider, success: false, error: '无刷新令牌' });
      continue;
    }
    if (!account.isTokenExpired() && !account.tokenRefreshFailed) {
      results.push({ provider: account.provider, success: true, error: 'Token未过期' });
      continue;
    }

    try {
      const provider = getProvider(account.provider);
      if (!provider) {
        results.push({ provider: account.provider, success: false, error: '无效的提供商' });
        continue;
      }

      const refreshed = await provider.refreshAccountToken(account);
      if (!refreshed) {
        await oauthAccountService.markTokenRefreshFailed(account.id);
        results.push({
          provider: account.provider,
          success: false,
          error: '刷新失败，已降级到密码登录并发送通知邮件',
        });
      } else {
        account.accessToken = refreshed.accessToken;
        if (refreshed.refreshToken) account.refreshToken = refreshed.refreshToken;
        account.expiresAt = refreshed.expiresAt;
        account.tokenRefreshFailed = false;
        await oauthAccountService['oauthAccountRepository'].save(account);
        results.push({ provider: account.provider, success: true });
      }
    } catch (err: any) {
      await oauthAccountService.markTokenRefreshFailed(account.id);
      results.push({
        provider: account.provider,
        success: false,
        error: err.message || '刷新失败',
      });
    }
  }

  res.json({ results });
});

export default router;
