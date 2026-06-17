import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('oauth_client')
export class OAuthClient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  clientId: string;

  @Column()
  clientSecret: string;

  @Column()
  name: string;

  @Column('simple-array')
  redirectUris: string[];

  @Column('simple-array')
  allowedScopes: string[];

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  requireConsent: boolean;

  @Column({ type: 'text', nullable: true })
  description: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  isValidRedirectUri(uri: string): boolean {
    return this.redirectUris.some((allowed) => {
      if (allowed.endsWith('/*')) {
        const prefix = allowed.slice(0, -1);
        return uri.startsWith(prefix);
      }
      return uri === allowed;
    });
  }

  hasScope(scope: string): boolean {
    return this.allowedScopes.includes(scope) || this.allowedScopes.includes('*');
  }

  hasAllScopes(scopes: string[]): boolean {
    return scopes.every((s) => this.hasScope(s));
  }
}
