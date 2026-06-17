import axios from 'axios';
import { BaseOAuthProvider, ProviderConfig } from './BaseOAuthProvider';
import { OAuthUserInfo } from '../services/OAuthAccountService';

export class GoogleProvider extends BaseOAuthProvider {
  constructor() {
    const config: ProviderConfig = {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
      scope: ['openid', 'email', 'profile'],
    };
    super('google', config);
  }

  getAuthorizationUrl(state: string, codeChallenge?: string, codeChallengeMethod?: string): string {
    const params: Record<string, string> = {
      client_id: this.config.clientId,
      redirect_uri: this.config.callbackUrl,
      response_type: 'code',
      scope: this.config.scope.join(' '),
      state,
      access_type: 'offline',
      prompt: 'consent',
    };
    if (codeChallenge && codeChallengeMethod) {
      params.code_challenge = codeChallenge;
      params.code_challenge_method = codeChallengeMethod;
    }
    return `${this.config.authorizationUrl}?${new URLSearchParams(params).toString()}`;
  }

  async exchangeCodeForToken(code: string, codeVerifier?: string): Promise<OAuthUserInfo> {
    if (process.env.GOOGLE_CLIENT_ID === 'google-dev-client-id') {
      return this.mockExchangeCode(code);
    }

    try {
      const tokenData: Record<string, string> = {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.config.callbackUrl,
      };
      if (codeVerifier) {
        tokenData.code_verifier = codeVerifier;
      }

      const tokenResponse = await axios.post(this.config.tokenUrl, new URLSearchParams(tokenData), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const userInfoResponse = await axios.get(this.config.userInfoUrl, {
        headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` },
      });

      const userData = userInfoResponse.data;

      return {
        providerUserId: userData.sub,
        email: userData.email,
        nickname: userData.name,
        avatar: userData.picture,
        accessToken: tokenResponse.data.access_token,
        refreshToken: tokenResponse.data.refresh_token,
        expiresIn: tokenResponse.data.expires_in,
        scope: tokenResponse.data.scope,
      };
    } catch (error) {
      console.error('Google OAuth error:', error);
      throw error;
    }
  }

  private async mockExchangeCode(code: string): Promise<OAuthUserInfo> {
    return {
      providerUserId: `google_${Date.now()}`,
      email: `google_${code.substring(0, 8)}@example.com`,
      nickname: 'Google用户',
      avatar: 'https://lh3.googleusercontent.com/a/default-user=s96-c',
      accessToken: `mock_google_access_${Date.now()}`,
      refreshToken: `mock_google_refresh_${Date.now()}`,
      expiresIn: 3600,
      scope: 'openid email profile',
    };
  }

  async refreshAccessToken(
    refreshToken: string
  ): Promise<{ accessToken: string; expiresIn: number } | null> {
    if (refreshToken.startsWith('mock_')) {
      if (Math.random() < 0.1) return null;
      return {
        accessToken: `mock_google_access_${Date.now()}`,
        expiresIn: 3600,
      };
    }
    return null;
  }
}
