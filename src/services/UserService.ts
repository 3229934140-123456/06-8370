import { Repository, QueryFailedError } from 'typeorm';
import { User } from '../entities/User';
import { AppDataSource } from '../data-source';
import { hashPassword, comparePassword } from '../utils/jwt';

export class UserService {
  private userRepository: Repository<User>;

  constructor() {
    this.userRepository = AppDataSource.getRepository(User);
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
      relations: ['oauthAccounts'],
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email: email.toLowerCase() },
      relations: ['oauthAccounts'],
    });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { phone },
      relations: ['oauthAccounts'],
    });
  }

  async findByIdentifier(identifier: string): Promise<User | null> {
    if (identifier.includes('@')) {
      return this.findByEmail(identifier);
    }
    return this.findByPhone(identifier);
  }

  async create(userData: Partial<User>): Promise<User> {
    const email = userData.email ? userData.email.toLowerCase() : undefined;

    if (email) {
      const existing = await this.userRepository.findOne({ where: { email } });
      if (existing) {
        throw new Error('UNIQUE_CONSTRAINT:email');
      }
    }
    if (userData.phone) {
      const existing = await this.userRepository.findOne({ where: { phone: userData.phone } });
      if (existing) {
        throw new Error('UNIQUE_CONSTRAINT:phone');
      }
    }

    try {
      const user = this.userRepository.create({
        ...userData,
        email,
      });
      return await this.userRepository.save(user);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        const msg = (err as any).message || '';
        if (msg.includes('UNIQUE') || msg.includes('unique') || msg.includes('duplicate')) {
          if (msg.includes('email')) {
            throw new Error('UNIQUE_CONSTRAINT:email');
          }
          if (msg.includes('phone')) {
            throw new Error('UNIQUE_CONSTRAINT:phone');
          }
          throw new Error('UNIQUE_CONSTRAINT:unknown');
        }
      }
      throw err;
    }
  }

  async update(id: string, data: Partial<User>): Promise<User | null> {
    const email = data.email ? data.email.toLowerCase() : undefined;

    if (email) {
      const existing = await this.userRepository.findOne({ where: { email } });
      if (existing && existing.id !== id) {
        throw new Error('UNIQUE_CONSTRAINT:email');
      }
    }
    if (data.phone) {
      const existing = await this.userRepository.findOne({ where: { phone: data.phone } });
      if (existing && existing.id !== id) {
        throw new Error('UNIQUE_CONSTRAINT:phone');
      }
    }

    try {
      await this.userRepository.update(id, {
        ...data,
        email,
      });
      return this.findById(id);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        const msg = (err as any).message || '';
        if (msg.includes('UNIQUE') || msg.includes('unique') || msg.includes('duplicate')) {
          if (msg.includes('email')) {
            throw new Error('UNIQUE_CONSTRAINT:email');
          }
          if (msg.includes('phone')) {
            throw new Error('UNIQUE_CONSTRAINT:phone');
          }
          throw new Error('UNIQUE_CONSTRAINT:unknown');
        }
      }
      throw err;
    }
  }

  async setPassword(userId: string, password: string): Promise<void> {
    const passwordHash = await hashPassword(password);
    await this.userRepository.update(userId, { passwordHash });
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    if (!user.passwordHash) return false;
    return comparePassword(password, user.passwordHash);
  }
}

export const userService = new UserService();
