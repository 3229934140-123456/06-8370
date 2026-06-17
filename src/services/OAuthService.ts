import { Repository } from 'typeorm';
import { AuthCode } from '../entities/AuthCode';
import { RefreshToken } from '../entities/RefreshToken';
import { PKCEChallenge } from '../entities/PKCEChallenge';
import { AppDataSource } from '../data-source';
import {
  generateAuthCode,
  generateRefreshToken as genRefreshToken,
  verifyCodeChallenge,
} from '../utils/pkce';
import { signAccessToken } from '../utils/jwt';

export class OAuthService {
  private authCodeRepository: Repository<AuthCode>;
  private refreshTokenRepository: Repository<RefreshToken>;
  private pkceChallengeRepository: Repository<PKCEChallenge>;

  private registeredClients = new Map<string, string>();

  constructor() {
    this.authCodeRepository = AppDataSource.getRepository(AuthCode);
    this.refreshTokenRepository = AppDataSource.getRepository(RefreshToken);
    this.pkceChallengeRepository = AppDataSource.getRepository(PKCEChallenge);

    this.registeredClients.set(
      process.env.CLIENT_ID || 'auth-service-client',
      process.env.CLIENT_SECRET || 'auth-service-secret'
    );
  }

  validateClient(clientId: string, clientSecret?: string): boolean {
    const secret = this.registeredClients.get(clientId);
    if (!secret) return false;
    if (clientSecret && secret !== clientSecret) return false;
    return true;
  }

  async savePKCEChallenge(state: string, codeVerifier: string): Promise<void> {
    const challenge = this.pkceChallengeRepository.create({
      state,
      codeVerifier,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    await this.pkceChallengeRepository.save(challenge);
  }

  async getAndConsumePKCEVerifier(state: string): Promise<string | null> {
    const challenge = await this.pkceChallengeRepository.findOne({ where: { state } });
    if (!challenge) return null;
    await this.pkceChallengeRepository.remove(challenge);
    if (new Date() > challenge.expiresAt) return null;
    return challenge.codeVerifier;
  }

  async generateAuthCode(
    clientId: string,
    userId: string,
    redirectUri: string,
    scope: string[],
    codeChallenge?: string,
    codeChallengeMethod?: string
  ): Promise<string> {
    const code = generateAuthCode();
    const authCode = this.authCodeRepository.create({
      code,
      clientId,
      userId,
      redirectUri,
      scope,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      codeChallenge,
      codeChallengeMethod,
    });
    await this.authCodeRepository.save(authCode);
    return code;
  }

  async exchangeCodeForToken(
    code: string,
    clientId: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<{ access_token: string; refresh_token: string; token_type: string; expires_in: number } | null> {
    const authCode = await this.authCodeRepository.findOne({ where: { code } });

    if (!authCode) return null;
    if (authCode.isUsed) return null;
    if (authCode.clientId !== clientId) return null;
    if (authCode.redirectUri !== redirectUri) return null;
    if (new Date() > authCode.expiresAt) return null;

    if (authCode.codeChallenge) {
      if (!codeVerifier) return null;
      const method = (authCode.codeChallengeMethod as 'S256' | 'plain') || 'S256';
      if (!verifyCodeChallenge(codeVerifier, authCode.codeChallenge, method)) {
        return null;
      }
    }

    authCode.isUsed = true;
    await this.authCodeRepository.save(authCode);

    const accessToken = signAccessToken({ userId: authCode.userId });
    const refreshTokenStr = genRefreshToken();

    const refreshToken = this.refreshTokenRepository.create({
      token: refreshTokenStr,
      userId: authCode.userId,
      clientId: authCode.clientId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    await this.refreshTokenRepository.save(refreshToken);

    return {
      access_token: accessToken,
      refresh_token: refreshTokenStr,
      token_type: 'Bearer',
      expires_in: 3600,
    };
  }

  async refreshToken(
    token: string,
    clientId: string
  ): Promise<{ access_token: string; refresh_token: string; token_type: string; expires_in: number } | null> {
    const refreshToken = await this.refreshTokenRepository.findOne({ where: { token } });

    if (!refreshToken) return null;
    if (refreshToken.isRevoked) return null;
    if (refreshToken.clientId !== clientId) return null;
    if (new Date() > refreshToken.expiresAt) return null;

    refreshToken.isRevoked = true;
    await this.refreshTokenRepository.save(refreshToken);

    const accessToken = signAccessToken({ userId: refreshToken.userId });
    const newRefreshTokenStr = genRefreshToken();

    const newRefreshToken = this.refreshTokenRepository.create({
      token: newRefreshTokenStr,
      userId: refreshToken.userId,
      clientId: refreshToken.clientId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    await this.refreshTokenRepository.save(newRefreshToken);

    return {
      access_token: accessToken,
      refresh_token: newRefreshTokenStr,
      token_type: 'Bearer',
      expires_in: 3600,
    };
  }

  async revokeRefreshToken(token: string): Promise<void> {
    await this.refreshTokenRepository.update({ token }, { isRevoked: true });
  }
}

export const oauthService = new OAuthService();
