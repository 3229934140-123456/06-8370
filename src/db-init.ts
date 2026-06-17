import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_VERSION = 3;

interface DuplicateReport {
  field: string;
  count: number;
  items: Array<{ value: string; ids: string[] }>;
}

interface MigrationReport {
  backupPath?: string;
  backupSuccess: boolean;
  duplicates: DuplicateReport[];
  migrations: Array<{ version: number; name: string; applied: boolean }>;
  currentVersion: number;
  errors: string[];
}

export async function initializeDatabase(ds: DataSource): Promise<MigrationReport> {
  if (!ds.isInitialized) {
    await ds.initialize();
  }
  const queryRunner = ds.createQueryRunner();
  const report: MigrationReport = {
    backupSuccess: false,
    duplicates: [],
    migrations: [],
    currentVersion: 0,
    errors: [],
  };

  console.log('\n========================================');
  console.log('🔒 开始安全数据库迁移流程');
  console.log('========================================\n');

  try {
    const dbPath = findDatabasePath();
    report.backupSuccess = await performBackup(dbPath, report);

    report.duplicates = await checkDuplicateData(queryRunner);
    printDuplicateReport(report.duplicates);

    report.currentVersion = await getCurrentSchemaVersion(queryRunner);
    console.log(`\n当前数据库版本: v${report.currentVersion}`);
    console.log(`目标数据库版本: v${MIGRATION_VERSION}\n`);

    const migrationsToApply = getMigrations().filter(
      (m) => m.version > report.currentVersion
    );

    if (migrationsToApply.length === 0) {
      console.log('✅ 数据库已是最新版本，无需迁移');
    } else {
      console.log(`需要执行 ${migrationsToApply.length} 个迁移:\n`);
      for (const migration of migrationsToApply) {
        try {
          console.log(`▶️  执行迁移 v${migration.version}: ${migration.name}`);
          await migration.up(queryRunner);
          report.migrations.push({ version: migration.version, name: migration.name, applied: true });
          console.log(`✅ 迁移 v${migration.version} 完成\n`);
        } catch (e: any) {
          const errorMsg = `迁移 v${migration.version} 失败: ${e.message}`;
          console.error(`❌ ${errorMsg}\n`);
          report.errors.push(errorMsg);
          report.migrations.push({ version: migration.version, name: migration.name, applied: false });
          if (migration.required) {
            throw new Error(`关键迁移失败，已中断: ${errorMsg}`);
          }
        }
      }

      await setSchemaVersion(queryRunner, MIGRATION_VERSION);
    }

    await printDatabaseSummary(queryRunner, report);

    console.log('\n========================================');
    console.log('✅ 数据库安全迁移流程完成');
    console.log('========================================\n');

    return report;
  } catch (error) {
    console.error('\n❌ 数据库迁移失败:', error);
    report.errors.push(String(error));
    throw error;
  } finally {
    await queryRunner.release();
  }
}

function findDatabasePath(): string | null {
  const candidates = [
    path.join(process.cwd(), 'database.sqlite'),
    path.join(process.cwd(), 'data', 'database.sqlite'),
    path.join(process.cwd(), 'src', '..', 'database.sqlite'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

async function performBackup(dbPath: string | null, report: MigrationReport): Promise<boolean> {
  if (!dbPath || !fs.existsSync(dbPath)) {
    console.log('⚠️  未找到现有数据库文件，跳过备份');
    return false;
  }

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const backupPath = path.join(backupDir, `database-${timestamp}.sqlite`);

    console.log(`📦 正在备份数据库...`);
    console.log(`   源文件: ${dbPath}`);
    console.log(`   备份到: ${backupPath}`);

    fs.copyFileSync(dbPath, backupPath);

    const originalSize = fs.statSync(dbPath).size;
    const backupSize = fs.statSync(backupPath).size;

    if (originalSize !== backupSize) {
      throw new Error(`备份文件大小不匹配 (源: ${originalSize}, 备份: ${backupSize})`);
    }

    report.backupPath = backupPath;
    console.log(`✅ 备份完成 (${(backupSize / 1024).toFixed(2)} KB)\n`);
    return true;
  } catch (e: any) {
    console.error(`❌ 数据库备份失败: ${e.message}`);
    console.log('⚠️  将继续执行迁移，但建议先手动备份\n');
    report.errors.push(`备份失败: ${e.message}`);
    return false;
  }
}

async function checkDuplicateData(queryRunner: any): Promise<DuplicateReport[]> {
  console.log('🔍 正在检查重复数据...');
  const duplicates: DuplicateReport[] = [];

  const tableExists = async (tableName: string): Promise<boolean> => {
    const result = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`
    );
    return result.length > 0;
  };

  if (!(await tableExists('user'))) {
    console.log('   user 表不存在，跳过重复检查\n');
    return [];
  }

  const emailDups = await queryRunner.query(`
    SELECT email, GROUP_CONCAT(id) as ids, COUNT(*) as cnt
    FROM "user"
    WHERE email IS NOT NULL AND email != ''
    GROUP BY email
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
  `);

  if (emailDups.length > 0) {
    duplicates.push({
      field: 'email',
      count: emailDups.length,
      items: emailDups.map((d: any) => ({
        value: d.email,
        ids: d.ids.split(','),
      })),
    });
  }

  const phoneDups = await queryRunner.query(`
    SELECT phone, GROUP_CONCAT(id) as ids, COUNT(*) as cnt
    FROM "user"
    WHERE phone IS NOT NULL AND phone != ''
    GROUP BY phone
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
  `);

  if (phoneDups.length > 0) {
    duplicates.push({
      field: 'phone',
      count: phoneDups.length,
      items: phoneDups.map((d: any) => ({
        value: d.phone,
        ids: d.ids.split(','),
      })),
    });
  }

  return duplicates;
}

function printDuplicateReport(duplicates: DuplicateReport[]): void {
  if (duplicates.length === 0) {
    console.log('✅ 未发现重复数据\n');
    return;
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    ⚠️  重复数据报告                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  for (const dup of duplicates) {
    console.log(`\n📋 字段: ${dup.field} - 发现 ${dup.count} 组重复:`);
    for (const item of dup.items) {
      console.log(`   - "${item.value}" 被 ${item.ids.length} 个用户使用: ${item.ids.join(', ')}`);
    }
  }

  console.log('\n⚠️  建议: 先清理重复数据，否则唯一索引将无法创建。');
  console.log('   可以在个人中心查看详细冲突信息。\n');
}

async function getCurrentSchemaVersion(queryRunner: any): Promise<number> {
  const tableExists = async (tableName: string): Promise<boolean> => {
    const result = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`
    );
    return result.length > 0;
  };

  if (!(await tableExists('schema_version'))) {
    await queryRunner.query(`
      CREATE TABLE "schema_version" (
        "version" integer PRIMARY KEY NOT NULL,
        "appliedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    return 0;
  }

  const result = await queryRunner.query(`SELECT MAX(version) as v FROM "schema_version"`);
  return result[0]?.v || 0;
}

async function setSchemaVersion(queryRunner: any, version: number): Promise<void> {
  await queryRunner.query(`
    INSERT INTO "schema_version" ("version") VALUES (${version})
  `);
}

function getMigrations() {
  return [
    {
      version: 1,
      name: '初始化核心表结构',
      required: true,
      up: async (queryRunner: any) => {
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
        }

        if (!(await indexExists('IDX_user_email'))) {
          try {
            await queryRunner.query(
              `CREATE UNIQUE INDEX "IDX_user_email" ON "user" ("email") WHERE email IS NOT NULL`
            );
          } catch (e: any) {
            if (e.message.includes('UNIQUE constraint failed') || e.message.includes('duplicate')) {
              console.log('   ⚠️  email存在重复，跳过唯一索引创建（后续清理数据后可手动创建）');
            } else {
              throw e;
            }
          }
        }

        if (!(await indexExists('IDX_user_phone'))) {
          try {
            await queryRunner.query(
              `CREATE UNIQUE INDEX "IDX_user_phone" ON "user" ("phone") WHERE phone IS NOT NULL`
            );
          } catch (e: any) {
            if (e.message.includes('UNIQUE constraint failed') || e.message.includes('duplicate')) {
              console.log('   ⚠️  phone存在重复，跳过唯一索引创建（后续清理数据后可手动创建）');
            } else {
              throw e;
            }
          }
        }

        if (!(await tableExists('oauth_account'))) {
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
        }

        if (!(await tableExists('auth_code'))) {
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
        }

        if (!(await tableExists('refresh_token'))) {
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
        }

        if (!(await tableExists('pkce_challenge'))) {
          await queryRunner.query(`
            CREATE TABLE "pkce_challenge" (
              "id" varchar PRIMARY KEY NOT NULL,
              "state" varchar NOT NULL UNIQUE,
              "codeVerifier" varchar NOT NULL,
              "expiresAt" datetime NOT NULL,
              "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
            )
          `);
        }
      },
    },
    {
      version: 2,
      name: '添加 OAuth2 客户端管理表',
      required: true,
      up: async (queryRunner: any) => {
        const tableExists = async (tableName: string): Promise<boolean> => {
          const result = await queryRunner.query(
            `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`
          );
          return result.length > 0;
        };

        if (!(await tableExists('oauth_client'))) {
          await queryRunner.query(`
            CREATE TABLE "oauth_client" (
              "id" varchar PRIMARY KEY NOT NULL,
              "clientId" varchar NOT NULL UNIQUE,
              "clientSecret" varchar NOT NULL,
              "name" varchar NOT NULL,
              "description" varchar,
              "redirectUris" text NOT NULL,
              "allowedScopes" text NOT NULL,
              "isActive" boolean NOT NULL DEFAULT (1),
              "requireConsent" boolean NOT NULL DEFAULT (0),
              "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
              "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
            )
          `);
          await queryRunner.query(`CREATE INDEX "IDX_oauth_client_clientId" ON "oauth_client" ("clientId")`);
        }
      },
    },
    {
      version: 3,
      name: '添加用户授权同意表',
      required: true,
      up: async (queryRunner: any) => {
        const tableExists = async (tableName: string): Promise<boolean> => {
          const result = await queryRunner.query(
            `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`
          );
          return result.length > 0;
        };

        if (!(await tableExists('oauth_consent'))) {
          await queryRunner.query(`
            CREATE TABLE "oauth_consent" (
              "id" varchar PRIMARY KEY NOT NULL,
              "clientId" varchar NOT NULL,
              "userId" varchar NOT NULL,
              "scope" text NOT NULL,
              "expiresAt" datetime NOT NULL,
              "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
              "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
            )
          `);
          await queryRunner.query(
            `CREATE UNIQUE INDEX "IDX_oauth_consent_client_user" ON "oauth_consent" ("clientId", "userId")`
          );
        }
      },
    },
  ];
}

async function printDatabaseSummary(queryRunner: any, report: MigrationReport): Promise<void> {
  console.log('\n📊 数据库状态汇总:');
  console.log('   ───────────────────────────────────');

  const tableExists = async (tableName: string): Promise<boolean> => {
    const result = await queryRunner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`
    );
    return result.length > 0;
  };

  const tables = [
    { name: 'user', desc: '用户表' },
    { name: 'oauth_account', desc: '三方账号绑定' },
    { name: 'oauth_client', desc: 'OAuth2客户端' },
    { name: 'oauth_consent', desc: '用户授权同意' },
    { name: 'auth_code', desc: '授权码' },
    { name: 'refresh_token', desc: '刷新令牌' },
    { name: 'pkce_challenge', desc: 'PKCE挑战' },
  ];

  for (const table of tables) {
    if (await tableExists(table.name)) {
      const count = await queryRunner.query(`SELECT COUNT(*) as cnt FROM "${table.name}"`);
      const status = count[0].cnt > 0 ? `${count[0].cnt} 条记录` : '空表';
      console.log(`   ✅ ${table.desc.padEnd(14)} (${table.name}): ${status}`);
    } else {
      console.log(`   ❌ ${table.desc.padEnd(14)} (${table.name}): 缺失!`);
      report.errors.push(`表 ${table.name} 缺失`);
    }
  }

  console.log('   ───────────────────────────────────');

  if (report.duplicates.length > 0) {
    for (const dup of report.duplicates) {
      console.log(`   ⚠️  ${dup.field}: ${dup.count} 组重复`);
    }
  }

  if (report.errors.length > 0) {
    console.log(`   ❌ ${report.errors.length} 个错误需要处理`);
  }
}

export function getDuplicateDataReport() {
  return { MIGRATION_VERSION };
}
