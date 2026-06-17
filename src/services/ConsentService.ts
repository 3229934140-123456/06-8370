import { Repository } from 'typeorm';
import { OAuthConsent } from '../entities/OAuthConsent';
import { AppDataSource } from '../data-source';

const CONSENT_VALIDITY_DAYS = 30;

export class ConsentService {
  private consentRepository: Repository<OAuthConsent>;

  constructor() {
    this.consentRepository = AppDataSource.getRepository(OAuthConsent);
  }

  async find(clientId: string, userId: string): Promise<OAuthConsent | null> {
    return this.consentRepository.findOne({ where: { clientId, userId } });
  }

  async createOrUpdate(clientId: string, userId: string, scope: string[]): Promise<OAuthConsent> {
    let consent = await this.find(clientId, userId);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + CONSENT_VALIDITY_DAYS);

    if (consent) {
      consent.scope = scope;
      consent.expiresAt = expiresAt;
      return this.consentRepository.save(consent);
    }

    consent = this.consentRepository.create({
      clientId,
      userId,
      scope,
      expiresAt,
    });
    return this.consentRepository.save(consent);
  }

  async isConsentGiven(clientId: string, userId: string, scopes: string[]): Promise<boolean> {
    const consent = await this.find(clientId, userId);
    if (!consent) return false;
    return consent.covers(scopes);
  }

  async revoke(clientId: string, userId: string): Promise<boolean> {
    const result = await this.consentRepository.delete({ clientId, userId });
    return (result.affected || 0) > 0;
  }
}

export const consentService = new ConsentService();
