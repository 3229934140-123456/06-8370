import { DataSource } from 'typeorm';

export async function initializeDatabase(ds: DataSource): Promise<void> {
  if (!ds.isInitialized) {
    await ds.initialize();
  }
  const queryRunner = ds.createQueryRunner();

  try {
    console.log('安全初始化数据库...');

    const tableExists = async (tableName: string): Promise<boolean> => {
      const result = await queryRunner.query(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`
      );
      return result.length > 0;
    };

    const indexExists = async (indexName: string): Promise<boolean> => {
      const result = await queryRunner.query(
        `SELECT name FROM sqlite_master WHERE type='index' AND name='${indexName}'`
      );
      return result.length > 0;
    };

    if (!(await tableExists('user'))) {
      console.log('创建 user 表...');
      await queryRunner.query(`
        CREATE TABLE "user" (
          "id" varchar PRIMARY KEY NOT NULL,
          "email" varchar,
          "phone" varchar,
          "passwordHash" varchar,
          "nickname" varchar,
          "avatar" varchar,
          "emailVerified" boolean NOT NULL DEFAULT (0),
          "phoneVerified" boolean NOT NULL DEFAULT (0),
          "isActive" boolean NOT NULL DEFAULT (1),
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
        )
      `);
    } else {
      console.log('user 表已存在，跳过创建');
    }

    if (!(await indexExists('IDX_user_email'))) {
      console.log('添加 email 唯一索引...');
      try {
        await queryRunner.query(
          `CREATE UNIQUE INDEX "IDX_user_email" ON "user" ("email") WHERE email IS NOT NULL`
        );
      } catch (e: any) {
        if (e.message.includes('UNIQUE constraint failed') || e.message.includes('duplicate')) {
          console.warn('⚠️  email 字段存在重复数据，无法添加唯一索引');
          console.warn('⚠️  请先清理重复的邮箱数据后重试');
        } else {
          throw e;
        }
      }
    }

    if (!(await indexExists('IDX_user_phone'))) {
      console.log('添加 phone 唯一索引...');
      try {
        await queryRunner.query(
          `CREATE UNIQUE INDEX "IDX_user_phone" ON "user" ("phone") WHERE phone IS NOT NULL`
        );
      } catch (e: any) {
        if (e.message.includes('UNIQUE constraint failed') || e.message.includes('duplicate')) {
          console.warn('⚠️  phone 字段存在重复数据，无法添加唯一索引');
          console.warn('⚠️  请先清理重复的手机号数据后重试');
        } else {
          throw e;
        }
      }
    }

    if (!(await tableExists('oauth_account'))) {
      console.log('创建 oauth_account 表...');
      await queryRunner.query(`
        CREATE TABLE "oauth_account" (
          "id" varchar PRIMARY KEY NOT NULL,
          "provider" varchar NOT NULL,
          "providerUserId" varchar NOT NULL,
          "accessToken" varchar,
          "refreshToken" varchar,
          "expiresAt" datetime,
          "scope" varchar,
          "tokenRefreshFailed" boolean NOT NULL DEFAULT (0),
          "userId" varchar NOT NULL,
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
          CONSTRAINT "FK_oauth_account_user" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE
        )
      `);
      await queryRunner.query(
        `CREATE UNIQUE INDEX "IDX_oauth_account_provider_user" ON "oauth_account" ("provider", "providerUserId")`
      );
    } else {
      console.log('oauth_account 表已存在，跳过创建');
    }

    if (!(await tableExists('auth_code'))) {
      console.log('创建 auth_code 表...');
      await queryRunner.query(`
        CREATE TABLE "auth_code" (
          "id" varchar PRIMARY KEY NOT NULL,
          "code" varchar NOT NULL,
          "clientId" varchar NOT NULL,
          "userId" varchar NOT NULL,
          "redirectUri" varchar NOT NULL,
          "scope" varchar,
          "expiresAt" datetime NOT NULL,
          "isUsed" boolean NOT NULL DEFAULT (0),
          "codeChallenge" varchar,
          "codeChallengeMethod" varchar,
          "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
        )
      `);
      await queryRunner.query(`CREATE INDEX "IDX_auth_code_code" ON "auth_code" ("code")`);
    } else {
      console.log('auth_code 表已存在，跳过创建');
    }

    if (!(await tableExists('refresh_token'))) {
      console.log('创建 refresh_token 表...');
      await queryRunner.query(`
        CREATE TABLE "refresh_token" (
          "id" varchar PRIMARY KEY NOT NULL,
          "token" varchar NOT NULL,
          "userId" varchar NOT NULL,
          "clientId" varchar NOT NULL,
          "expiresAt" datetime NOT NULL,
          "isRevoked" boolean NOT NULL DEFAULT (0),
          "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
        )
      `);
      await queryRunner.query(`CREATE INDEX "IDX_refresh_token_token" ON "refresh_token" ("token")`);
    } else {
      console.log('refresh_token 表已存在，跳过创建');
    }

    if (!(await tableExists('pkce_challenge'))) {
      console.log('创建 pkce_challenge 表...');
      await queryRunner.query(`
        CREATE TABLE "pkce_challenge" (
          "id" varchar PRIMARY KEY NOT NULL,
          "state" varchar NOT NULL UNIQUE,
          "codeVerifier" varchar NOT NULL,
          "expiresAt" datetime NOT NULL,
          "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
        )
      `);
    } else {
      console.log('pkce_challenge 表已存在，跳过创建');
    }

    console.log('✅ 数据库初始化完成，现有数据已保留');

    const userCount = await queryRunner.query(`SELECT COUNT(*) as cnt FROM "user"`);
    const oauthCount = await queryRunner.query(`SELECT COUNT(*) as cnt FROM "oauth_account"`);
    console.log(`当前数据: ${userCount[0].cnt} 个用户, ${oauthCount[0].cnt} 个三方绑定`);
  } catch (error) {
    console.error('数据库初始化失败:', error);
    throw error;
  } finally {
    await queryRunner.release();
  }
}
