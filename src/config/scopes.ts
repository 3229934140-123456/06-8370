export interface ScopeDescription {
  name: string;
  label: string;
  description: string;
}

export const SCOPE_DESCRIPTIONS: ScopeDescription[] = [
  { name: 'openid', label: '身份认证', description: '获取您的基本身份信息' },
  { name: 'profile', label: '个人资料', description: '获取您的昵称、头像等公开资料' },
  { name: 'email', label: '邮箱地址', description: '获取您的邮箱地址' },
  { name: 'phone', label: '手机号码', description: '获取您的手机号码' },
  { name: 'read:user', label: '读取用户信息', description: '读取您的账号基本信息' },
  { name: 'write:user', label: '修改用户信息', description: '修改您的账号资料' },
];

export function getScopeDescriptions(scopes: string[]): ScopeDescription[] {
  return scopes.map((s) => {
    const desc = SCOPE_DESCRIPTIONS.find((d) => d.name === s);
    return desc || { name: s, label: s, description: `访问 ${s} 权限` };
  });
}
