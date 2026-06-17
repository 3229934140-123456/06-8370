import 'reflect-metadata';
import { DataSource } from 'typeorm';
import path from 'path';
import { User } from './entities/User';
import { OAuthAccount } from './entities/OAuthAccount';
import { AuthCode } from './entities/AuthCode';
import { RefreshToken } from './entities/RefreshToken';
import { PKCEChallenge } from './entities/PKCEChallenge';

export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: path.join(__dirname, '..', 'database.sqlite'),
  synchronize: true,
  logging: false,
  entities: [User, OAuthAccount, AuthCode, RefreshToken, PKCEChallenge],
  migrations: [],
  subscribers: [],
});
