import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { users } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { UsersService, UserEntity } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { MailService } from '../mail/mail.service';
import { TotpService } from '../../services/totpService';

export interface AuthResponse {
  accessToken: string;
  expiresIn: string;
  user: UserEntity;
  requires2FA?: boolean;
  sessionToken?: string;
}

@Injectable()
export class AuthService {
  private readonly twoFactorSessions = new Map<string, { userId: number; expiresAt: Date }>();

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly totpService: TotpService,
  ) { }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const normalizedEmail = dto.email.toLowerCase();
    const existingEmail = await this.usersService.findByEmail(normalizedEmail);
    if (existingEmail) {
      throw new ConflictException('Email already in use');
    }

    const existingUsername = await this.usersService.findByUsername(
      dto.username,
    );
    if (existingUsername) {
      throw new ConflictException('Username already in use');
    }

    const user = await this.usersService.create({
      username: dto.username.trim(),
      email: normalizedEmail,
      password: dto.password,
      fullName: dto.fullName.trim(),
      phoneNumber: dto.phoneNumber,
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const candidate = await this.validateCredentials(
      dto.usernameOrEmail,
      dto.password,
    );
    const { password_hash, two_factor_secret, ...safeUser } = candidate;

    // Check if user has 2FA enabled
    if (candidate.two_factor_enabled && candidate.two_factor_secret) {
      // Generate a temporary session token
      const sessionToken = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      this.twoFactorSessions.set(sessionToken, {
        userId: candidate.id_users,
        expiresAt,
      });

      // Clean up expired sessions
      this.cleanupExpiredSessions();

      return {
        accessToken: '',
        expiresIn: '',
        user: safeUser as UserEntity,
        requires2FA: true,
        sessionToken,
      };
    }

    return this.buildAuthResponse(safeUser as UserEntity);
  }

  async verify2FA(usernameOrEmail: string, token: string, sessionToken: string): Promise<AuthResponse> {
    // Verify session token
    const session = this.twoFactorSessions.get(sessionToken);
    if (!session) {
      throw new UnauthorizedException('Session không hợp lệ hoặc đã hết hạn');
    }

    if (new Date() > session.expiresAt) {
      this.twoFactorSessions.delete(sessionToken);
      throw new UnauthorizedException('Session đã hết hạn');
    }

    // Get user
    const identifier = usernameOrEmail.trim();
    const user = identifier.includes('@')
      ? await this.usersService.findByEmail(identifier.toLowerCase())
      : await this.usersService.findByUsername(identifier);

    if (!user || user.id_users !== session.userId) {
      throw new UnauthorizedException('Thông tin không hợp lệ');
    }

    if (!user.two_factor_secret) {
      throw new UnauthorizedException('2FA chưa được thiết lập');
    }

    // Verify TOTP token; if fail, try backup code
    const isTotpValid = this.totpService.verifyTotpToken(user.two_factor_secret, token);
    let backupCodeUsed = false;
    if (!isTotpValid) {
      backupCodeUsed = await this.usersService.consumeBackupCode(user.id_users, token);
    }
    if (!isTotpValid && !backupCodeUsed) {
      throw new UnauthorizedException('Mã 2FA/mã dự phòng không đúng hoặc đã hết hạn');
    }

    // Remove session
    this.twoFactorSessions.delete(sessionToken);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, two_factor_secret, ...safeUser } = user;
    return this.buildAuthResponse(safeUser);
  }

  async requestPasswordReset(dto: ForgotPasswordDto) {
    const username = dto.username.trim();
    const email = dto.email.trim().toLowerCase();

    const candidate = await this.usersService.findByUsername(username);
    if (!candidate || candidate.email.toLowerCase() !== email) {
      throw new UnauthorizedException(
        'Tên đăng nhập hoặc email không chính xác',
      );
    }

    const token = randomBytes(32).toString('hex');
    const ttlMinutes = Number(
      this.configService.get<string>('RESET_TOKEN_TTL_MINUTES') ?? '30',
    );
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await this.usersService.setResetToken(candidate.id_users, token, expiresAt);
    await this.mailService.sendPasswordResetEmail({
      to: email,
      username: candidate.full_name || candidate.username,
      token,
      expiresInMinutes: ttlMinutes,
    });

    return {
      message: 'Yêu cầu đặt lại mật khẩu đã được gửi đến email của bạn',
      expiresAt,
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.usersService.findByResetToken(token);

    if (!user) {
      throw new UnauthorizedException(
        'Token không hợp lệ hoặc đã hết hạn',
      );
    }

    // Update password
    await this.usersService.updatePassword(user.id_users, newPassword);

    // Clear reset token
    await this.usersService.clearResetToken(user.id_users);

    return {
      message: 'Mật khẩu đã được đặt lại thành công',
    };
  }

  private async validateCredentials(
    usernameOrEmail: string,
    password: string,
  ): Promise<users> {
    const identifier = usernameOrEmail.trim();
    const candidate = identifier.includes('@')
      ? await this.usersService.findByEmail(identifier.toLowerCase())
      : await this.usersService.findByUsername(identifier);

    if (!candidate) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(
      password,
      candidate.password_hash,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return candidate;
  }

  private async buildAuthResponse(user: UserEntity): Promise<AuthResponse> {
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '15m');
    const payload: JwtPayload = {
      sub: user.id_users,
      username: user.username,
      role: user.role ?? 'user',
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      expiresIn,
      user,
    };
  }

  private cleanupExpiredSessions(): void {
    const now = new Date();
    for (const [token, session] of this.twoFactorSessions.entries()) {
      if (now > session.expiresAt) {
        this.twoFactorSessions.delete(token);
      }
    }
  }
}
