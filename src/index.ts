import 'reflect-metadata';
import 'dotenv/config';
import express from 'express';
import path from 'path';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import { AppDataSource } from './data-source';
import { initializeDatabase } from './db-init';
import authRoutes from './routes/auth';
import oauthRoutes from './routes/oauth';
import oauth2Routes from './routes/oauth2';
import profileRoutes from './routes/profile';
import adminRoutes from './routes/admin';
import indexRoutes from './routes/index';
import { optionalAuth } from './middleware/auth';

import { ClientService } from './services/ClientService';

const app = express();
const PORT = process.env.PORT || 3000;
const clientService = new ClientService();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    },
  })
);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((req, res, next) => {
  res.locals.env = process.env;
  next();
});

app.use(optionalAuth);

app.use('/', indexRoutes);
app.use('/', authRoutes);
app.use('/auth', oauthRoutes);
app.use('/oauth2', oauth2Routes);
app.use('/', profileRoutes);
app.use('/', adminRoutes);

AppDataSource.initialize()
  .then(() => initializeDatabase(AppDataSource))
  .then(() => clientService.seedDefaultClient())
  .then(() => {
    console.log('数据库连接成功');
    app.listen(PORT, () => {
      console.log(`\n========================================`);
      console.log(`  OAuth2 聚合认证服务已启动`);
      console.log(`  服务地址: http://localhost:${PORT}`);
      console.log(`  登录页面: http://localhost:${PORT}/login`);
      console.log(`  个人中心: http://localhost:${PORT}/profile`);
      console.log(`  授权端点: http://localhost:${PORT}/oauth2/authorize`);
      console.log(`  Token端点: http://localhost:${PORT}/oauth2/token`);
      console.log(`========================================\n`);
      console.log(`提示: 本服务使用Mock OAuth提供商，无需真实配置即可测试。`);
      console.log(`生产环境请在 .env 中配置真实的OAuth凭证和SMTP信息。\n`);
    });
  })
  .catch((error) => {
    console.error('数据库连接失败:', error);
    process.exit(1);
  });
