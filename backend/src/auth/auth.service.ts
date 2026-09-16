import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UserDocument } from '../users/schemas/user.schema';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const user = await this.usersService.create(dto);
    const tokens = await this.issueTokens(user);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmailWithPassword(dto.email);
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    // Después de validar la contraseña: a quien no la sabe no le decimos si la cuenta existe.
    this.assertActive(user);
    const tokens = await this.issueTokens(user);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async refresh(userId: string, refreshToken: string) {
    const user = await this.usersService.findByIdWithRefreshToken(userId);
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Sesión inválida');
    }
    const matches = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!matches) {
      throw new UnauthorizedException('Sesión inválida');
    }
    // Sin esto, una sesión abierta antes de la baja se renovaría para siempre.
    this.assertActive(user);
    const tokens = await this.issueTokens(user);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async logout(userId: string) {
    await this.usersService.setRefreshTokenHash(userId, null);
  }

  /** Cambio de contraseña propio; devuelve tokens nuevos ya sin el flag pendiente. */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.usersService.changePassword(
      userId,
      dto.currentPassword,
      dto.newPassword,
    );
    const tokens = await this.issueTokens(user);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  /**
   * Una cuenta desactivada no vuelve a entrar ni renueva su sesión. El access token
   * que ya tenga sigue valiendo hasta expirar (`JWT_ACCESS_EXPIRES_IN`, 15 min por
   * defecto); la baja le borra el refresh token, así que esa sesión muere ahí.
   */
  private assertActive(user: UserDocument) {
    if (!user.isActive) {
      throw new UnauthorizedException(
        'Tu cuenta está desactivada. Contactá al administrador.',
      );
    }
  }

  private async issueTokens(user: UserDocument): Promise<TokenPair> {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      isSuperAdmin: user.isSuperAdmin,
      mustChangePassword: user.mustChangePassword,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('jwt.accessSecret'),
      expiresIn: this.configService.get<string>('jwt.accessExpiresIn'),
    } as JwtSignOptions);
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: this.configService.get<string>('jwt.refreshExpiresIn'),
    } as JwtSignOptions);

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.usersService.setRefreshTokenHash(user.id, refreshTokenHash);

    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: UserDocument) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isSuperAdmin: user.isSuperAdmin,
      company: user.company,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
