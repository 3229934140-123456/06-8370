import axios from 'axios';
import { BaseOAuthProvider, ProviderConfig } from './BaseOAuthProvider';
import { OAuthUserInfo } from '../services/OAuthAccountService';

export class WeChatProvider extends BaseOAuthProvider {
  constructor() {
    const config: ProviderConfig = {
      clientId: process.env.WECHAT_APP_ID || '',
      clientSecret: process.env.WECHAT_APP_SECRET || '',
      callbackUrl: process.env.WECHAT_CALLBACK_URL || 'http://localhost:3000/auth/wechat/callback',
      authorizationUrl: 'https://open.weixin.qq.com/connect/qrconnect',
      tokenUrl: 'https://api.weixin.qq.com/sns/oauth2/access_token',
      userInfoUrl: 'https://api.weixin.qq.com/sns/userinfo',
      scope: ['snsapi_login'],
    };
    super('wechat', config);
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      appid: this.config.clientId,
      redirect_uri: encodeURIComponent(this.config.callbackUrl),
      response_type: 'code',
      scope: this.config.scope.join(','),
      state,
    });
    return `${this.config.authorizationUrl}?${params.toString()}#wechat_redirect`;
  }

  async exchangeCodeForToken(code: string): Promise<OAuthUserInfo> {
    if (process.env.WECHAT_APP_ID === 'wx-dev-app-id') {
      return this.mockExchangeCode(code);
    }

    try {
      const tokenResponse = await axios.get(this.config.tokenUrl, {
        params: {
          appid: this.config.clientId,
          secret: this.config.clientSecret,
          code,
          grant_type: 'authorization_code',
        },
      });

      const tokenData = tokenResponse.data;
      if (tokenData.errcode) {
        throw new Error(`WeChat OAuth error: ${tokenData.errmsg}`);
      }

      const userInfoResponse = await axios.get(this.config.userInfoUrl, {
        params: {
          access_token: tokenData.access_token,
          openid: tokenData.openid,
          lang: 'zh_CN',
        },
      });

      const userData = userInfoResponse.data;
      if (userData.errcode) {
        throw new Error(`WeChat userinfo error: ${userData.errmsg}`);
      }

      return {
        providerUserId: userData.unionid || userData.openid,
        nickname: userData.nickname,
        avatar: userData.headimgurl,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
        scope: tokenData.scope,
      };
    } catch (error) {
      console.error('WeChat OAuth error:', error);
      throw error;
    }
  }

  private async mockExchangeCode(code: string): Promise<OAuthUserInfo> {
    return {
      providerUserId: `wechat_${Date.now()}`,
      nickname: '微信用户',
      avatar: 'https://thirdwx.qlogo.cn/mmopen/vi_32/default/132',
      accessToken: `mock_wechat_access_${Date.now()}`,
      refreshToken: `mock_wechat_refresh_${Date.now()}`,
      expiresIn: 7200,
      scope: 'snsapi_login',
    };
  }

  async refreshAccessToken(
    refreshToken: string
  ): Promise<{ accessToken: string; expiresIn: number } | null> {
    if (refreshToken.startsWith('mock_')) {
      if (Math.random() < 0.1) return null;
      return {
        accessToken: `mock_wechat_access_${Date.now()}`,
        expiresIn: 7200,
      };
    }
    return null;
  }
}
