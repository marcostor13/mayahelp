import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
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
    const tokens = await this.issueTokens(user);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async logout(userId: string) {
    await this.usersService.setRefreshTokenHash(userId, null);
  }

  private async issueTokens(user: UserDocument): Promise<TokenPair> {
    const payload = { sub: user.id, email: user.email, role: user.role };

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
      company: user.company,
    };
  }
}
