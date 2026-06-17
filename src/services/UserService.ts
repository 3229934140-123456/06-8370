import { Repository } from 'typeorm';
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
    const user = this.userRepository.create({
      ...userData,
      email: userData.email ? userData.email.toLowerCase() : undefined,
    });
    return this.userRepository.save(user);
  }

  async update(id: string, data: Partial<User>): Promise<User | null> {
    await this.userRepository.update(id, {
      ...data,
      email: data.email ? data.email.toLowerCase() : undefined,
    });
    return this.findById(id);
  }

  async setPassword(userId: string, password: string): Promise<void> {
    const passwordHash = await hashPassword(password);
    await this.userRepository.update(userId, { passwordHash });
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    if (!user.passwordHash) return false;
    return comparePassword(password, user.passwordHash);
  }

  async mergeUsers(sourceUserId: string, targetUserId: string): Promise<User> {
    const sourceUser = await this.findById(sourceUserId);
    const targetUser = await this.findById(targetUserId);

    if (!sourceUser || !targetUser) {
      throw new Error('用户不存在');
    }

    if (!targetUser.nickname && sourceUser.nickname) {
      targetUser.nickname = sourceUser.nickname;
    }
    if (!targetUser.avatar && sourceUser.avatar) {
      targetUser.avatar = sourceUser.avatar;
    }

    await this.userRepository.save(targetUser);
    await this.userRepository.delete(sourceUserId);

    return this.findById(targetUserId) as Promise<User>;
  }
}

export const userService = new UserService();
