import { OAuthProvider } from './BaseOAuthProvider';
import { GitHubProvider } from './GitHubProvider';
import { GoogleProvider } from './GoogleProvider';
import { WeChatProvider } from './WeChatProvider';
import { ProviderType } from '../entities/OAuthAccount';

const providers = new Map<ProviderType, OAuthProvider>();

providers.set('github', new GitHubProvider());
providers.set('google', new GoogleProvider());
providers.set('wechat', new WeChatProvider());

export function getProvider(provider: ProviderType): OAuthProvider | undefined {
  return providers.get(provider);
}

export function getAllProviders(): Map<ProviderType, OAuthProvider> {
  return providers;
}

export function isValidProvider(provider: string): provider is ProviderType {
  return ['github', 'google', 'wechat'].includes(provider);
}

export function getProviderDisplayName(provider: ProviderType): string {
  const names: Record<ProviderType, string> = {
    github: 'GitHub',
    google: 'Google',
    wechat: '微信',
  };
  return names[provider];
}
