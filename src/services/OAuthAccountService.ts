import { Repository, In } from 'typeorm';
import { OAuthAccount, ProviderType } from '../entities/OAuthAccount';
import { User } from '../entities/User';
import { AppDataSource } from '../data-source';
import { userService } from './UserService';
import { sendReauthorizeNotification } from '../utils/email';

export interface OAuthUserInfo {
  providerUserId: string;
  email?: string;
  nickname?: string;
  avatar?: string;
  phone?: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
}

export class OAuthAccountService {
  private oauthAccountRepository: Repository<OAuthAccount>;

  constructor() {
    this.oauthAccountRepository = AppDataSource.getRepository(OAuthAccount);
  }

  async findByProvider(provider: ProviderType, providerUserId: string): Promise<OAuthAccount | null> {
    return this.oauthAccountRepository.findOne({
      where: { provider, providerUserId },
      relations: ['user'],
    });
  }

  async findByUser(userId: string): Promise<OAuthAccount[]> {
    return this.oauthAccountRepository.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
  }

  async createOrUpdate(
    userId: string,
    provider: ProviderType,
    info: OAuthUserInfo
  ): Promise<OAuthAccount> {
    let account = await this.findByProvider(provider, info.providerUserId);

    const expiresAt = info.expiresIn
      ? new Date(Date.now() + info.expiresIn * 1000)
      : undefined;

    if (account) {
      account.accessToken = info.accessToken;
      if (info.refreshToken) account.refreshToken = info.refreshToken;
      if (expiresAt) account.expiresAt = expiresAt;
      if (info.scope) account.scope = info.scope;
      account.tokenRefreshFailed = false;
      return this.oauthAccountRepository.save(account);
    }

    account = this.oauthAccountRepository.create({
      userId,
      provider,
      providerUserId: info.providerUserId,
      accessToken: info.accessToken,
      refreshToken: info.refreshToken,
      expiresAt,
      scope: info.scope,
    });
    return this.oauthAccountRepository.save(account);
  }

  async unbind(userId: string, provider: ProviderType): Promise<boolean> {
    const user = await userService.findById(userId);
    if (!user) return false;

    const loginMethods = user.getLoginMethodsCount();
    if (loginMethods <= 1) {
      throw new Error('至少保留一种登录方式');
    }

    const account = await this.oauthAccountRepository.findOne({
      where: { userId, provider },
    });
    if (!account) return false;

    await this.oauthAccountRepository.remove(account);
    return true;
  }

  async handleOAuthLogin(
    provider: ProviderType,
    info: OAuthUserInfo
  ): Promise<{ user: User; isNewUser: boolean; needsRegistration: boolean; merged: boolean }> {
    const existingAccount = await this.findByProvider(provider, info.providerUserId);

    if (existingAccount) {
      await this.createOrUpdate(existingAccount.userId, provider, info);
      const user = await userService.findById(existingAccount.userId);
      return { user: user!, isNewUser: false, needsRegistration: false, merged: false };
    }

    let targetUser: User | null = null;
    let merged = false;

    if (info.email) {
      targetUser = await userService.findByEmail(info.email);
      if (targetUser) {
        merged = true;
      }
    }

    if (!targetUser && info.phone) {
      targetUser = await userService.findByPhone(info.phone);
      if (targetUser) {
        merged = true;
      }
    }

    if (!targetUser) {
      const needsRegistration = !info.email;
      targetUser = await userService.create({
        email: info.email,
        phone: info.phone,
        nickname: info.nickname,
        avatar: info.avatar,
        emailVerified: !!info.email,
      });
      await this.createOrUpdate(targetUser.id, provider, info);
      return { user: targetUser, isNewUser: true, needsRegistration, merged: false };
    }

    const existingTargetUserId = targetUser.id;
    await this.createOrUpdate(existingTargetUserId, provider, info);

    let needUpdate = false;
    const updateData: Partial<User> = {};
    if (!targetUser.nickname && info.nickname) {
      updateData.nickname = info.nickname;
      needUpdate = true;
    }
    if (!targetUser.avatar && info.avatar) {
      updateData.avatar = info.avatar;
      needUpdate = true;
    }
    if (needUpdate) {
      targetUser = (await userService.update(existingTargetUserId, updateData)) || targetUser;
    }

    return { user: targetUser, isNewUser: false, needsRegistration: false, merged };
  }

  async markTokenRefreshFailed(accountId: string): Promise<void> {
    const account = await this.oauthAccountRepository.findOne({
      where: { id: accountId },
      relations: ['user'],
    });
    if (!account) return;

    account.tokenRefreshFailed = true;
    await this.oauthAccountRepository.save(account);

    if (account.user.email) {
      await sendReauthorizeNotification(account.user.email, account.provider);
    }
  }
}

export const oauthAccountService = new OAuthAccountService();
