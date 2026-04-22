import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Get,
  Res,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Response } from "express";
import { AuthService } from "./auth.service";
import { AuthUser } from "./auth.types";
import { CurrentUser } from "./decorators/current-user.decorator";
import { Public } from "./decorators/public.decorator";
import { LoginDto } from "./dto/login.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto);
    res.cookie(
      this.auth.refreshCookieName(),
      result.refreshToken,
      this.auth.buildRefreshCookieOptions(result.rememberMe),
    );
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  @Public()
  @UseGuards(AuthGuard("refresh-jwt"))
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@CurrentUser() user: AuthUser) {
    return this.auth.issueAccessToken(user);
  }

  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(this.auth.refreshCookieName(), this.auth.buildClearCookieOptions());
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }
}
