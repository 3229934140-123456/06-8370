import { ProviderType } from '../entities/OAuthAccount';
import { OAuthUserInfo } from '../services/OAuthAccountService';

export interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string[];
}

export interface OAuthProvider {
  getAuthorizationUrl(state: string, codeChallenge?: string, codeChallengeMethod?: string): string;
  exchangeCodeForToken(code: string, codeVerifier?: string): Promise<OAuthUserInfo>;
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number } | null>;
  refreshAccountToken(account: {
    id: string;
    refreshToken?: string;
    accessToken: string;
    expiresAt?: Date;
  }): Promise<{ accessToken: string; refreshToken?: string; expiresAt: Date } | null>;
}

export abstract class BaseOAuthProvider implements OAuthProvider {
  protected config: ProviderConfig;
  protected provider: ProviderType;

  constructor(provider: ProviderType, config: ProviderConfig) {
    this.provider = provider;
    this.config = config;
  }

  abstract getAuthorizationUrl(
    state: string,
    codeChallenge?: string,
    codeChallengeMethod?: string
  ): string;

  abstract exchangeCodeForToken(code: string, codeVerifier?: string): Promise<OAuthUserInfo>;

  abstract refreshAccessToken(
    refreshToken: string
  ): Promise<{ accessToken: string; expiresIn: number } | null>;

  async refreshAccountToken(account: {
    id: string;
    refreshToken?: string;
    accessToken: string;
    expiresAt?: Date;
  }): Promise<{ accessToken: string; refreshToken?: string; expiresAt: Date } | null> {
    if (!account.refreshToken) return null;
    const result = await this.refreshAccessToken(account.refreshToken);
    if (!result) return null;
    return {
      accessToken: result.accessToken,
      refreshToken: account.refreshToken,
      expiresAt: new Date(Date.now() + result.expiresIn * 1000),
    };
  }
}
