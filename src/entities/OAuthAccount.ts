import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User';

export type ProviderType = 'github' | 'google' | 'wechat';

@Entity()
export class OAuthAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  provider: ProviderType;

  @Column()
  providerUserId: string;

  @Column({ nullable: true })
  accessToken: string;

  @Column({ nullable: true })
  refreshToken: string;

  @Column({ type: 'datetime', nullable: true })
  expiresAt: Date;

  @Column({ nullable: true })
  scope: string;

  @Column({ default: false })
  tokenRefreshFailed: boolean;

  @ManyToOne(() => User, (user) => user.oauthAccounts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  isTokenExpired(): boolean {
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
  }
}
