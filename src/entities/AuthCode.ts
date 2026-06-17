import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class AuthCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  code: string;

  @Column()
  clientId: string;

  @Column()
  userId: string;

  @Column()
  redirectUri: string;

  @Column('simple-array', { nullable: true })
  scope: string[];

  @Column()
  expiresAt: Date;

  @Column({ default: false })
  isUsed: boolean;

  @Column({ nullable: true })
  codeChallenge: string;

  @Column({ nullable: true })
  codeChallengeMethod: string;

  @CreateDateColumn()
  createdAt: Date;
}
