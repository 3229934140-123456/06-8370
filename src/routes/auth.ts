import { Request, Response, Router } from 'express';
import { userService } from '../services/UserService';
import { signAccessToken, comparePassword } from '../utils/jwt';

const router = Router();

router.get('/login', (req: Request, res: Response) => {
  const error = req.query.error as string;
  const success = req.query.success as string;
  const redirect = req.query.redirect as string || '/';
  res.render('login', { error, success, redirect, title: '登录' });
});

router.post('/login/password', async (req: Request, res: Response) => {
  const { identifier, password, redirect } = req.body;

  try {
    const user = await userService.findByIdentifier(identifier);
    if (!user) {
      return res.render('login', {
        error: '用户不存在',
        redirect: redirect || '/',
        title: '登录',
      });
    }

    const valid = await userService.verifyPassword(user, password);
    if (!valid) {
      return res.render('login', {
        error: '密码错误',
        redirect: redirect || '/',
        title: '登录',
      });
    }

    const token = signAccessToken({ userId: user.id, email: user.email });
    res.cookie('access_token', token, {
      httpOnly: true,
      maxAge: 3600 * 1000,
      sameSite: 'lax',
    });
    if (req.session) {
      req.session.user = { userId: user.id, email: user.email };
    }

    res.redirect(redirect || '/');
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', {
      error: '登录失败，请稍后重试',
      redirect: redirect || '/',
      title: '登录',
    });
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
      delete req.session!.pendingOAuth;
      res.redirect(`/auth/${pendingOAuth.provider}/callback?complete_registration=1&user_id=${user.id}`);
      return;
    }

    const token = signAccessToken({ userId: user.id, email: user.email });
    res.cookie('access_token', token, {
      httpOnly: true,
      maxAge: 3600 * 1000,
      sameSite: 'lax',
    });
    if (req.session) {
      req.session.user = { userId: user.id, email: user.email };
    }
    res.redirect('/');
  } catch (error) {
    console.error('Registration error:', error);
    res.render('register', {
      error: '注册失败，请稍后重试',
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
