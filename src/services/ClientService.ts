import { Repository } from 'typeorm';
import { OAuthClient } from '../entities/OAuthClient';
import { AppDataSource } from '../data-source';

export class ClientService {
  private clientRepository: Repository<OAuthClient>;

  constructor() {
    this.clientRepository = AppDataSource.getRepository(OAuthClient);
  }

  async findAll(): Promise<OAuthClient[]> {
    return this.clientRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findByClientId(clientId: string): Promise<OAuthClient | null> {
    return this.clientRepository.findOne({ where: { clientId, isActive: true } });
  }

  async findById(id: string): Promise<OAuthClient | null> {
    return this.clientRepository.findOne({ where: { id } });
  }

  async create(data: Partial<OAuthClient>): Promise<OAuthClient> {
    const client = this.clientRepository.create({
      ...data,
      isActive: data.isActive !== false,
    });
    return this.clientRepository.save(client);
  }

  async update(id: string, data: Partial<OAuthClient>): Promise<OAuthClient | null> {
    await this.clientRepository.update(id, data);
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.clientRepository.delete(id);
    return (result.affected || 0) > 0;
  }

  async validateClient(clientId: string, clientSecret?: string): Promise<OAuthClient | null> {
    const client = await this.findByClientId(clientId);
    if (!client) return null;
    if (clientSecret && client.clientSecret !== clientSecret) return null;
    return client;
  }

  async validateRedirectUri(clientId: string, redirectUri: string): Promise<boolean> {
    const client = await this.findByClientId(clientId);
    if (!client) return false;
    return client.isValidRedirectUri(redirectUri);
  }

  async validateScopes(clientId: string, scopes: string[]): Promise<boolean> {
    const client = await this.findByClientId(clientId);
    if (!client) return false;
    return client.hasAllScopes(scopes);
  }

  async seedDefaultClient(): Promise<OAuthClient> {
    const defaultClientId = process.env.CLIENT_ID || 'auth-service-client';
    const existing = await this.findByClientId(defaultClientId);
    if (existing) {
      console.log(`✅ 默认客户端已存在: ${existing.name} (${defaultClientId})`);
      return existing;
    }

    const client = await this.create({
      clientId: defaultClientId,
      clientSecret: process.env.CLIENT_SECRET || 'auth-service-secret',
      name: '默认测试客户端',
      description: '开发环境默认测试客户端',
      redirectUris: [
        process.env.REDIRECT_URI || 'http://localhost:3000/callback',
        'http://localhost:3000/*',
      ],
      allowedScopes: ['openid', 'profile', 'email', 'phone', 'read:user', 'write:user'],
      requireConsent: true,
    });
    console.log(`✅ 默认客户端创建成功: ${client.name} (${defaultClientId})`);
    console.log(`   回调地址: ${client.redirectUris.join(', ')}`);
    console.log(`   允许范围: ${client.allowedScopes.join(', ')}`);
    return client;
  }
}

export const clientService = new ClientService();
