import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { OAuthAccount } from './OAuthAccount';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  passwordHash: string;

  @Column({ nullable: true })
  nickname: string;

  @Column({ nullable: true })
  avatar: string;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ default: false })
  phoneVerified: boolean;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => OAuthAccount, (account) => account.user, { cascade: true })
  oauthAccounts: OAuthAccount[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  hasPassword(): boolean {
    return !!this.passwordHash;
  }

  getLoginMethodsCount(): number {
    let count = 0;
    if (this.passwordHash) count++;
    if (this.oauthAccounts) count += this.oauthAccounts.length;
    return count;
  }
}
