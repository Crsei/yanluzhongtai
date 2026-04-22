import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { CookieOptions } from "express";
import { UsersService } from "../users/users.service";
import { AuthUser, JwtPayload } from "./auth.types";
import { DEFAULT_REFRESH_COOKIE_NAME } from "./strategies/refresh.strategy";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REMEMBER_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_REFRESH_TOKEN_TTL_SECONDS = 8 * 60 * 60;

export type LoginResult = {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  user: AuthUser;
  rememberMe: boolean;
};

export type RefreshResult = {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async login(input: { phone: string; password: string; rememberMe: boolean }): Promise<LoginResult> {
    const user = await this.usersService.findByPhone(input.phone);
    if (!user) {
      throw new UnauthorizedException("手机号或密码错误");
    }
    if (user.deactivatedAt) {
      throw new UnauthorizedException("账号已注销");
    }
    const ok = await this.usersService.verifyPassword(input.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException("手机号或密码错误");
    }

    await this.usersService.updateLastLogin(user.id);

    const authUser: AuthUser = {
      id: user.id,
      phone: user.phone,
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };

    const accessToken = this.signAccess(authUser);
    const refreshToken = this.signRefresh(authUser, input.rememberMe);

    return {
      accessToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshToken,
      user: authUser,
      rememberMe: input.rememberMe,
    };
  }

  issueAccessToken(user: AuthUser): RefreshResult {
    return {
      accessToken: this.signAccess(user),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user,
    };
  }

  refreshCookieName(): string {
    return this.config.get<string>("REFRESH_COOKIE_NAME", DEFAULT_REFRESH_COOKIE_NAME);
  }

  buildRefreshCookieOptions(rememberMe: boolean): CookieOptions {
    const base: CookieOptions = {
      httpOnly: true,
      secure: this.config.get<string>("NODE_ENV") === "production",
      sameSite: "lax",
      path: "/api/auth",
    };
    if (rememberMe) {
      return { ...base, maxAge: REMEMBER_REFRESH_TOKEN_TTL_SECONDS * 1000 };
    }
    return base;
  }

  buildClearCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get<string>("NODE_ENV") === "production",
      sameSite: "lax",
      path: "/api/auth",
    };
  }

  private signAccess(user: AuthUser): string {
    const payload: JwtPayload = { sub: user.id };
    return this.jwt.sign(payload, {
      secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  private signRefresh(user: AuthUser, rememberMe: boolean): string {
    const payload: JwtPayload = { sub: user.id };
    return this.jwt.sign(payload, {
      secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      expiresIn: rememberMe
        ? REMEMBER_REFRESH_TOKEN_TTL_SECONDS
        : SESSION_REFRESH_TOKEN_TTL_SECONDS,
    });
  }
}
