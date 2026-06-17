import { Request, Response, Router } from 'express';
import { userService } from '../services/UserService';
import { oauthAccountService, OAuthUserInfo } from '../services/OAuthAccountService';
import { signAccessToken, comparePassword } from '../utils/jwt';

const router = Router();

function redirectAfterLogin(req: Request, res: Response, userId: string, email?: string) {
  const token = signAccessToken({ userId, email });
  res.cookie('access_token', token, {
    httpOnly: true,
    maxAge: 3600 * 1000,
    sameSite: 'lax',
  });
  if (req.session) {
    req.session.user = { userId, email };
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
    if (pa.state) {
      params.set('state', pa.state);
    }
    return res.redirect(`/oauth2/authorize?${params.toString()}`);
  }

  res.redirect('/');
}

router.get('/login', (req: Request, res: Response) => {
  const error = req.query.error as string;
  const success = req.query.success as string;

  if (req.session?.pendingAuthorize) {
    res.render('login', {
      error: error || '请先登录，登录后将跳转到授权确认页',
      success,
      title: '登录',
    });
    return;
  }

  res.render('login', { error, success, title: '登录' });
});

router.post('/login/password', async (req: Request, res: Response) => {
  const { identifier, password } = req.body;

  try {
    const user = await userService.findByIdentifier(identifier);
    if (!user) {
      return res.render('login', { error: '用户不存在', title: '登录' });
    }

    const valid = await userService.verifyPassword(user, password);
    if (!valid) {
      return res.render('login', { error: '密码错误', title: '登录' });
    }

    redirectAfterLogin(req, res, user.id, user.email);
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { error: '登录失败，请稍后重试', title: '登录' });
  }
});

router.get('/register', (req: Request, res: Response) => {
  const pendingOAuth = req.session?.pendingOAuth;
  const provider = pendingOAuth?.provider;
  const userInfo = pendingOAuth?.userInfo;
  res.render('register', {
    provider,
    userInfo,
    error: null,
    title: '完善注册信息',
  });
});

router.post('/register', async (req: Request, res: Response) => {
  const { email, phone, password, nickname } = req.body;
  const pendingOAuth = req.session?.pendingOAuth;

  try {
    if (!email && !phone) {
      return res.render('register', {
        error: '邮箱或手机号至少填写一项',
        provider: pendingOAuth?.provider,
        userInfo: pendingOAuth?.userInfo,
        title: '完善注册信息',
      });
    }

    let existingUser = null;
    if (email) existingUser = await userService.findByEmail(email);
    if (!existingUser && phone) existingUser = await userService.findByPhone(phone);

    if (existingUser) {
      return res.render('register', {
        error: '该邮箱或手机号已被注册，请直接登录或绑定其他账号',
        provider: pendingOAuth?.provider,
        userInfo: pendingOAuth?.userInfo,
        title: '完善注册信息',
      });
    }

    const user = await userService.create({
      email,
      phone,
      nickname: nickname || (email ? email.split('@')[0] : phone),
      emailVerified: !!email,
      phoneVerified: !!phone,
    });

    if (password) {
      await userService.setPassword(user.id, password);
    }

    if (pendingOAuth) {
      const provider = pendingOAuth.provider as 'github' | 'google' | 'wechat';
      await oauthAccountService.createOrUpdate(user.id, provider, pendingOAuth.userInfo as OAuthUserInfo);
      delete req.session!.pendingOAuth;

      redirectAfterLogin(req, res, user.id, user.email);
      return;
    }

    redirectAfterLogin(req, res, user.id, user.email);
  } catch (error: any) {
    console.error('Registration error:', error);
    const duplicateMsg = error?.message?.includes('UNIQUE')
      ? '该邮箱或手机号已被注册'
      : '注册失败，请稍后重试';
    res.render('register', {
      error: duplicateMsg,
      provider: pendingOAuth?.provider,
      userInfo: pendingOAuth?.userInfo,
      title: '完善注册信息',
    });
  }
});

router.get('/logout', (req: Request, res: Response) => {
  if (req.session) {
    req.session.destroy(() => {});
  }
  res.clearCookie('access_token');
  res.redirect('/login');
});

export default router;
