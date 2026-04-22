import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { AuthUser } from "../auth.types";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

/**
 * Paths (after the global /api prefix) that are allowed even when the
 * authenticated user has mustChangePassword=true. Everything else is blocked
 * so the user is forced through /users/me/initial-password-change.
 */
const ALWAYS_ALLOWED: ReadonlyArray<{ method: string; path: string }> = [
  { method: "GET", path: "/auth/me" },
  { method: "POST", path: "/users/me/initial-password-change" },
];

@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const user = (req as Request & { user?: AuthUser }).user;
    if (!user) return true; // unauthenticated — JwtAuthGuard will handle
    if (!user.mustChangePassword) return true;

    const method = req.method.toUpperCase();
    const path = (req.originalUrl ?? req.url ?? "").split("?")[0];
    const allowed = ALWAYS_ALLOWED.some(
      (rule) => rule.method === method && path.endsWith(rule.path),
    );
    if (allowed) return true;

    throw new ForbiddenException({
      code: "MUST_CHANGE_PASSWORD",
      message: "请先修改密码",
    });
  }
}
