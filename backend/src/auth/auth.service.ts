import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { DatabaseService, User } from '../database/database.service';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün
const BCRYPT_ROUNDS = 10;

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  user: { id: string; email: string };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private db: DatabaseService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async register(email: string, password: string): Promise<AuthTokens> {
    const existing = await this.db.findUserByEmail(email);
    if (existing) throw new ConflictException('E-posta zaten kayıtlı');

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await this.db.createUser({ email, password_hash });
    return this.issueTokens(user);
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    const user = await this.db.findUserByEmail(email);
    if (!user) throw new UnauthorizedException('Geçersiz e-posta veya şifre');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new UnauthorizedException('Geçersiz e-posta veya şifre');

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.db.findValidRefreshToken(tokenHash);
    if (!stored) throw new UnauthorizedException('Geçersiz veya süresi dolmuş refresh token');

    const user = await this.db.findUserById(stored.user_id);
    if (!user) throw new UnauthorizedException('Kullanıcı bulunamadı');

    // Rotate: eski token'ı iptal edip yenisini üret
    await this.db.revokeRefreshToken(stored.id);
    return this.issueTokens(user);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.db.findValidRefreshToken(tokenHash);
    if (stored) await this.db.revokeRefreshToken(stored.id);
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    const access_token = this.jwt.sign(
      { sub: user.id, email: user.email },
      { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: ACCESS_TOKEN_TTL },
    );

    const refresh_token = randomBytes(48).toString('hex');
    await this.db.createRefreshToken({
      user_id: user.id,
      token_hash: hashToken(refresh_token),
      expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });

    return { access_token, refresh_token, user: { id: user.id, email: user.email } };
  }
}
