import axios from 'axios';
import { BaseOAuthProvider, ProviderConfig } from './BaseOAuthProvider';
import { OAuthUserInfo } from '../services/OAuthAccountService';
import { ProviderType } from '../entities/OAuthAccount';

export class GitHubProvider extends BaseOAuthProvider {
  constructor() {
    const config: ProviderConfig = {
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      callbackUrl: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/auth/github/callback',
      authorizationUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      userInfoUrl: 'https://api.github.com/user',
      scope: ['user:email', 'read:user'],
    };
    super('github', config);
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.callbackUrl,
      scope: this.config.scope.join(' '),
      state,
    });
    return `${this.config.authorizationUrl}?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string, _codeVerifier?: string): Promise<OAuthUserInfo> {
    if (process.env.GITHUB_CLIENT_ID === 'github-dev-client-id') {
      return this.mockExchangeCode(code);
    }

    try {
      const tokenResponse = await axios.post(
        this.config.tokenUrl,
        {
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code,
          redirect_uri: this.config.callbackUrl,
        },
        { headers: { Accept: 'application/json' } }
      );

      const accessToken = tokenResponse.data.access_token;

      const [userResponse, emailResponse] = await Promise.all([
        axios.get(this.config.userInfoUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        axios.get('https://api.github.com/user/emails', {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);

      const userData = userResponse.data;
      const emails = emailResponse.data;
      const primaryEmail = emails.find((e: any) => e.primary && e.verified)?.email || emails[0]?.email;

      return {
        providerUserId: String(userData.id),
        email: primaryEmail,
        nickname: userData.name || userData.login,
        avatar: userData.avatar_url,
        accessToken,
        scope: tokenResponse.data.scope,
        expiresIn: tokenResponse.data.expires_in,
      };
    } catch (error) {
      console.error('GitHub OAuth error:', error);
      throw error;
    }
  }

  private async mockExchangeCode(code: string): Promise<OAuthUserInfo> {
    return {
      providerUserId: `github_${Date.now()}`,
      email: `github_${code.substring(0, 8)}@example.com`,
      nickname: 'GitHub用户',
      avatar: 'https://avatars.githubusercontent.com/u/0?v=4',
      accessToken: `mock_github_access_${Date.now()}`,
      refreshToken: `mock_github_refresh_${Date.now()}`,
      expiresIn: 3600,
      scope: 'user:email read:user',
    };
  }

  async refreshAccessToken(
    refreshToken: string
  ): Promise<{ accessToken: string; expiresIn: number } | null> {
    if (refreshToken.startsWith('mock_')) {
      if (Math.random() < 0.1) return null;
      return {
        accessToken: `mock_github_access_${Date.now()}`,
        expiresIn: 3600,
      };
    }
    return null;
  }
}
