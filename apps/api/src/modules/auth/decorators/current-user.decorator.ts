import { ExecutionContext, createParamDecorator } from "@nestjs/common";
import { AuthUser } from "../auth.types";

export const CurrentUser = createParamDecorator<unknown, ExecutionContext, AuthUser>(
  (_data, ctx) => ctx.switchToHttp().getRequest().user,
);
