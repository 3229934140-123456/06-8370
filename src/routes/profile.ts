import { Request, Response, Router } from 'express';
import { authRequired, getCurrentUser } from '../middleware/auth';
import { userService } from '../services/UserService';
import { oauthAccountService } from '../services/OAuthAccountService';
import { getProviderDisplayName, isValidProvider, getProvider } from '../providers';
import { ProviderType } from '../entities/OAuthAccount';
import { comparePassword } from '../utils/jwt';
import { generateState } from '../utils/pkce';

const router = Router();

router.get('/profile', authRequired, async (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) return res.redirect('/login');

  const user = await userService.findById(currentUser.userId);
  if (!user) return res.redirect('/login');

  const oauthAccounts = await oauthAccountService.findByUser(user.id);
  const boundProviders = new Set(oauthAccounts.map((a) => a.provider));
  const availableProviders: { type: ProviderType; name: string; bound: boolean }[] = [];

  (['github', 'google', 'wechat'] as ProviderType[]).forEach((p) => {
    availableProviders.push({
      type: p,
      name: getProviderDisplayName(p),
      bound: boundProviders.has(p),
    });
  });

  const success = req.query.success as string;
  const error = req.query.error as string;

  res.render('profile', {
    user,
    oauthAccounts: oauthAccounts.map((a) => ({
      ...a,
      displayName: getProviderDisplayName(a.provider),
    })),
    availableProviders,
    canUnbind: user.getLoginMethodsCount() > 1,
    success,
    error,
    title: '个人中心',
  });
});

router.post('/profile/update', authRequired, async (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) return res.redirect('/login');

  const { nickname, email, phone } = req.body;

  try {
    const currentUserData = await userService.findById(currentUser.userId);
    let existingUser = null;
    if (email && email !== currentUserData?.email) {
      existingUser = await userService.findByEmail(email);
    }
    if (!existingUser && phone && phone !== currentUserData?.phone) {
      existingUser = await userService.findByPhone(phone);
    }

    if (existingUser) {
      return res.redirect('/profile?error=' + encodeURIComponent('该邮箱或手机号已被使用'));
    }

    await userService.update(currentUser.userId, { nickname, email, phone });
    res.redirect('/profile?success=' + encodeURIComponent('个人信息更新成功'));
  } catch (err: any) {
    const msg = err?.message?.includes('UNIQUE') ? '该邮箱或手机号已被使用' : '更新失败';
    res.redirect('/profile?error=' + encodeURIComponent(msg));
  }
});

router.post('/profile/password', authRequired, async (req: Request, res: Response) => {
  const currentUser = getCurrentUser(req);
  if (!currentUser) return res.redirect('/login');

  const { current_password, new_password, confirm_password } = req.body;
  const user = await userService.findById(currentUser.userId);

  if (!user) return res.redirect('/login');

  if (user.hasPassword() && current_password) {
    const valid = await comparePassword(current_password, user.passwordHash!);
    if (!valid) {
      return res.redirect('/profile?error=' + encodeURIComponent('当前密码错误'));
    }
  }

  if (new_password !== confirm_password) {
    return res.redirect('/profile?error=' + encodeURIComponent('两次输入的新密码不一致'));
  }

  if (!new_password || new_password.length < 6) {
    return res.redirect('/profile?error=' + encodeURIComponent('密码长度至少6位'));
  }

  try {
    await userService.setPassword(currentUser.userId, new_password);
    res.redirect('/profile?success=' + encodeURIComponent('密码设置成功'));
  } catch (err) {
    res.redirect('/profile?error=' + encodeURIComponent('密码设置失败'));
  }
});

router.post('/profile/bind/:provider', authRequired, async (req: Request, res: Response) => {
  const { provider } = req.params;
  if (!isValidProvider(provider)) {
    return res.redirect('/profile?error=' + encodeURIComponent('不支持的身份提供商'));
  }

  const currentUser = getCurrentUser(req);
  if (!currentUser) return res.redirect('/login');

  const oauthProvider = getProvider(provider);
  if (!oauthProvider) {
    return res.redirect('/profile?error=' + encodeURIComponent('不支持的身份提供商'));
  }

  const state = `bind_${provider}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  if (req.session) {
    req.session.oauthState = state;
    req.session.oauthBindUserId = currentUser.userId;
  }

  const authUrl = oauthProvider.getAuthorizationUrl(state);
  res.redirect(authUrl);
});

router.post('/profile/unbind/:provider', authRequired, async (req: Request, res: Response) => {
  const { provider } = req.params;
  if (!isValidProvider(provider)) {
    return res.redirect('/profile?error=' + encodeURIComponent('不支持的身份提供商'));
  }

  const currentUser = getCurrentUser(req);
  if (!currentUser) return res.redirect('/login');

  try {
    await oauthAccountService.unbind(currentUser.userId, provider);
    res.redirect('/profile?success=' + encodeURIComponent(`${getProviderDisplayName(provider)}已解绑`));
  } catch (err: any) {
    res.redirect('/profile?error=' + encodeURIComponent(err.message || '解绑失败'));
  }
});

export default router;
