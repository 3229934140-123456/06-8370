import { Request, Response, Router } from 'express';
import { clientService } from '../services/ClientService';
import { authRequired, getCurrentUser } from '../middleware/auth';
import { getScopeDescriptions } from '../config/scopes';
import * as crypto from 'crypto';

const router = Router();

router.get('/admin/clients', authRequired, async (req: Request, res: Response) => {
  const user = getCurrentUser(req);
  if (!user) return res.redirect('/login');

  const clients = await clientService.findAll();
  const success = req.query.success as string;
  const error = req.query.error as string;

  res.render('admin-clients', {
    clients,
    success,
    error,
    title: '客户端管理',
  });
});

router.get('/admin/clients/new', authRequired, (req: Request, res: Response) => {
  res.render('admin-client-form', {
    client: null,
    error: null,
    title: '创建客户端',
  });
});

router.get('/admin/clients/:id', authRequired, async (req: Request, res: Response) => {
  const { id } = req.params;
  const client = await clientService.findById(id);

  if (!client) {
    return res.redirect('/admin/clients?error=' + encodeURIComponent('客户端不存在'));
  }

  res.render('admin-client-form', {
    client,
    error: null,
    title: '编辑客户端',
  });
});

router.post('/admin/clients', authRequired, async (req: Request, res: Response) => {
  const { name, description, redirectUris, allowedScopes, requireConsent, isActive } = req.body;

  try {
    const clientId = `client_${crypto.randomBytes(8).toString('hex')}`;
    const clientSecret = crypto.randomBytes(32).toString('hex');

    const redirectUrisArray = (redirectUris as string)
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const scopesArray = (allowedScopes as string)
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    await clientService.create({
      name,
      description,
      clientId,
      clientSecret,
      redirectUris: redirectUrisArray,
      allowedScopes: scopesArray,
      requireConsent: requireConsent === 'on',
      isActive: isActive !== 'off',
    });

    res.redirect('/admin/clients?success=' + encodeURIComponent('客户端创建成功'));
  } catch (err: any) {
    res.render('admin-client-form', {
      client: req.body,
      error: err.message || '创建失败',
      title: '创建客户端',
    });
  }
});

router.post('/admin/clients/:id', authRequired, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, redirectUris, allowedScopes, requireConsent, isActive } = req.body;

  try {
    const redirectUrisArray = (redirectUris as string)
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const scopesArray = (allowedScopes as string)
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    await clientService.update(id, {
      name,
      description,
      redirectUris: redirectUrisArray,
      allowedScopes: scopesArray,
      requireConsent: requireConsent === 'on',
      isActive: isActive !== 'off',
    });

    res.redirect('/admin/clients?success=' + encodeURIComponent('客户端更新成功'));
  } catch (err: any) {
    const client = await clientService.findById(id);
    res.render('admin-client-form', {
      client: { ...client, ...req.body },
      error: err.message || '更新失败',
      title: '编辑客户端',
    });
  }
});

router.post('/admin/clients/:id/delete', authRequired, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await clientService.delete(id);
    res.redirect('/admin/clients?success=' + encodeURIComponent('客户端已删除'));
  } catch (err: any) {
    res.redirect('/admin/clients?error=' + encodeURIComponent(err.message || '删除失败'));
  }
});

router.post('/admin/clients/:id/rotate-secret', authRequired, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const client = await clientService.findById(id);
    if (!client) {
      return res.redirect('/admin/clients?error=' + encodeURIComponent('客户端不存在'));
    }
    const newSecret = crypto.randomBytes(32).toString('hex');
    await clientService.update(id, { clientSecret: newSecret });
    res.redirect(`/admin/clients/${id}?success=` + encodeURIComponent(`密钥已重置: ${newSecret}`));
  } catch (err: any) {
    res.redirect('/admin/clients?error=' + encodeURIComponent(err.message || '重置失败'));
  }
});

export default router;
