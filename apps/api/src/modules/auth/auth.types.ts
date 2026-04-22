import { UserRole } from "@prisma/client";

export type AuthUser = {
  id: string;
  phone: string;
  username: string;
  role: UserRole;
};

export type JwtPayload = {
  sub: string;
};
