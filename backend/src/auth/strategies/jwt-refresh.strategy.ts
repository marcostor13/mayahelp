import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Role } from '../../common/enums/role.enum';

interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

interface RefreshRequestBody {
  refreshToken?: string;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.refreshSecret')!,
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: JwtPayload) {
    const refreshToken = (req.body as RefreshRequestBody | undefined)
      ?.refreshToken;
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      refreshToken,
    };
  }
}
