import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, UpdateDateColumn } from 'typeorm';

@Entity('oauth_consent')
@Index(['clientId', 'userId'], { unique: true })
export class OAuthConsent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  clientId: string;

  @Column()
  userId: string;

  @Column('simple-array')
  scope: string[];

  @Column()
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  covers(scopes: string[]): boolean {
    if (this.isExpired()) return false;
    return scopes.every((s) => this.scope.includes(s));
  }
}
