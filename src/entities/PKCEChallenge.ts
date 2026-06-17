import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class PKCEChallenge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  state: string;

  @Column()
  codeVerifier: string;

  @Column()
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
