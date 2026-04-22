import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Request } from "express";
import { Strategy } from "passport-jwt";
import { UsersService } from "../../users/users.service";
import { AuthUser, JwtPayload } from "../auth.types";

export const DEFAULT_REFRESH_COOKIE_NAME = "yanlu_rt";

function cookieExtractor(cookieName: string) {
  return (req: Request): string | null => {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    return cookies?.[cookieName] ?? null;
  };
}

@Injectable()
export class RefreshStrategy extends PassportStrategy(Strategy, "refresh-jwt") {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const cookieName = config.get<string>("REFRESH_COOKIE_NAME", DEFAULT_REFRESH_COOKIE_NAME);
    super({
      jwtFromRequest: cookieExtractor(cookieName),
      secretOrKey: config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      phone: user.phone,
      username: user.username,
      role: user.role,
    };
  }
}
