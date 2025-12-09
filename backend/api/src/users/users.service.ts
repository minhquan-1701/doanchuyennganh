import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma, users } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { TotpService } from '../../services/totpService';


export interface UserPaginationParams {
  page?: number;
  limit?: number;
  search?: string;
}

export type UserEntity = Omit<users, 'password_hash'
  | 'two_factor_secret' | 'reset_token'
  | 'reset_token_expiry'
>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly totpService: TotpService,
  ) { }

  async create(dto: CreateUserDto): Promise<UserEntity> {
    const passwordHash = await this.hashPassword(dto.password);
    const normalizedEmail = dto.email.toLowerCase();
    const username = dto.username.trim();
    const fullName = dto.fullName.trim();
    const data: Prisma.usersCreateInput = {
      username,
      email: normalizedEmail,
      password_hash: passwordHash,
      full_name: fullName,
      phone_number: dto.phoneNumber,
      date_of_birth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      gender: dto.gender,
      address: dto.address,
      profile_image: dto.profileImage,
      role: dto.role ?? undefined,
      status: dto.status ?? undefined,
    };

    const user = await this.prisma.users.create({ data });
    return this.toUserEntity(user);
  }

  async findAll(params: UserPaginationParams = {}) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const where: Prisma.usersWhereInput = params.search
      ? {
        OR: [
          { username: { contains: params.search } },
          { email: { contains: params.search } },
          { full_name: { contains: params.search } },
        ],
      }
      : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.users.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.users.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toUserEntity(item)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number): Promise<UserEntity> {
    const user = await this.getUserOrThrow(id);
    return this.toUserEntity(user);
  }

  async findByEmail(email: string): Promise<users | null> {
    return this.prisma.users.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  async findByUsername(username: string): Promise<users | null> {
    return this.prisma.users.findUnique({
      where: { username: username.trim() },
    });
  }

  async setResetToken(
    userId: number,
    token: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.prisma.users.update({
      where: { id_users: userId },
      data: {
        reset_token: token,
        reset_token_expiry: expiresAt,
      },
    });
  }

  async findByResetToken(token: string): Promise<users | null> {
    const user = await this.prisma.users.findFirst({
      where: {
        reset_token: token,
        reset_token_expiry: {
          gt: new Date(), // Token must not be expired
        },
      },
    });
    return user;
  }

  async clearResetToken(userId: number): Promise<void> {
    await this.prisma.users.update({
      where: { id_users: userId },
      data: {
        reset_token: null,
        reset_token_expiry: null,
      },
    });
  }

  async update(id: number, dto: UpdateUserDto): Promise<UserEntity> {
    await this.getUserOrThrow(id);

    const data: Prisma.usersUpdateInput = {
      username: dto.username ? dto.username.trim() : undefined,
      email: dto.email ? dto.email.toLowerCase() : undefined,
      full_name: dto.fullName ? dto.fullName.trim() : undefined,
      phone_number: dto.phoneNumber,
      date_of_birth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      gender: dto.gender,
      address: dto.address,
      profile_image: dto.profileImage,
      role: dto.role ?? undefined,
      status: dto.status ?? undefined,
    };

    const user = await this.prisma.users.update({
      where: { id_users: id },
      data,
    });
    return this.toUserEntity(user);
  }

  async updatePassword(id: number, newPassword: string): Promise<UserEntity> {
    await this.getUserOrThrow(id);
    const passwordHash = await this.hashPassword(newPassword);
    const user = await this.prisma.users.update({
      where: { id_users: id },
      data: { password_hash: passwordHash },
    });
    return this.toUserEntity(user);
  }

  async remove(id: number): Promise<UserEntity> {
    await this.getUserOrThrow(id);
    const user = await this.prisma.users.delete({ where: { id_users: id } });
    return this.toUserEntity(user);
  }

  private async getUserOrThrow(id: number): Promise<users> {
    const user = await this.prisma.users.findUnique({
      where: { id_users: id },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private toUserEntity(user: users): UserEntity {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, two_factor_secret, reset_token, reset_token_expiry, ...rest } = user;
    return rest;
  }

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async setup2FA(userId: number): Promise<{ secret: string; qrCode: string }> {
    const user = await this.findOne(userId);

    if (user.two_factor_enabled) {
      throw new UnauthorizedException('2FA đã được bật');
    }

    const setup = await this.totpService.generateTotpSetup(user.email);

    await this.prisma.users.update({
      where: { id_users: userId },
      data: { two_factor_secret: setup.secret },
    });

    return {
      secret: setup.secret,
      qrCode: setup.qrCode,
    };
  }

  async enable2FA(userId: number, token: string): Promise<{ user: UserEntity; backupCodes: string[] }> {
    const user = await this.prisma.users.findUnique({
      where: { id_users: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.two_factor_enabled) {
      throw new UnauthorizedException('2FA đã được bật');
    }

    if (!user.two_factor_secret) {
      throw new UnauthorizedException('Vui lòng thiết lập 2FA trước');
    }

    const isValid = this.totpService.verifyTotpToken(user.two_factor_secret, token);
    if (!isValid) {
      throw new UnauthorizedException('Mã xác thực không đúng');
    }

    // Generate backup codes
    const backupCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      backupCodes.push(code);
    }

    // Enable 2FA and save backup codes
    const updatedUser = await this.prisma.users.update({
      where: { id_users: userId },
      data: {
        two_factor_enabled: true,
        two_factor_verified_at: new Date(),
      },
    });

    // Save backup codes to database
    await this.prisma.user_backup_codes.deleteMany({
      where: { id_users: userId },
    });

    await this.prisma.user_backup_codes.createMany({
      data: backupCodes.map(code => ({
        id_users: userId,
        code,
        used: false,
      })),
    });

    return {
      user: this.toUserEntity(updatedUser),
      backupCodes,
    };
  }

  async disable2FA(userId: number, token: string): Promise<UserEntity> {
    const user = await this.prisma.users.findUnique({
      where: { id_users: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.two_factor_enabled) {
      throw new UnauthorizedException('2FA chưa được bật');
    }

    if (!user.two_factor_secret) {
      throw new UnauthorizedException('2FA chưa được thiết lập');
    }

    const isValid = this.totpService.verifyTotpToken(user.two_factor_secret, token);
    if (!isValid) {
      throw new UnauthorizedException('Mã xác thực không đúng');
    }

    // Disable 2FA and delete backup codes
    const updatedUser = await this.prisma.users.update({
      where: { id_users: userId },
      data: {
        two_factor_enabled: false,
        two_factor_secret: null,
        two_factor_verified_at: null,
      },
    });

    // Delete all backup codes
    await this.prisma.user_backup_codes.deleteMany({
      where: { id_users: userId },
    });

    return this.toUserEntity(updatedUser);
  }

  async getBackupCodes(userId: number): Promise<{ codes: string[] }> {
    const user = await this.prisma.users.findUnique({
      where: { id_users: userId },
    });

    if (!user || !user.two_factor_enabled) {
      throw new UnauthorizedException('2FA chưa được bật');
    }

    const backupCodes = await this.prisma.user_backup_codes.findMany({
      where: { id_users: userId, used: false },
      select: { code: true },
    });

    return {
      codes: backupCodes.map(bc => bc.code),
    };
  }

  async regenerateBackupCodes(userId: number): Promise<{ codes: string[] }> {
    const user = await this.prisma.users.findUnique({
      where: { id_users: userId },
    });

    if (!user || !user.two_factor_enabled) {
      throw new UnauthorizedException('2FA chưa được bật');
    }

    // Generate new backup codes
    const newBackupCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      newBackupCodes.push(code);
    }

    // Delete old backup codes
    await this.prisma.user_backup_codes.deleteMany({
      where: { id_users: userId },
    });

    // Save new backup codes
    await this.prisma.user_backup_codes.createMany({
      data: newBackupCodes.map(code => ({
        id_users: userId,
        code,
        used: false,
      })),
    });

    return {
      codes: newBackupCodes,
    };
  }

  async consumeBackupCode(userId: number, code: string): Promise<boolean> {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return false;

    const updateResult = await this.prisma.user_backup_codes.updateMany({
      where: { id_users: userId, code: normalized, used: false },
      data: { used: true },
    });

    return updateResult.count > 0;
  }
}
