import { UserRole } from "@prisma/client";

export type AuthUser = {
  id: string;
  phone: string;
  username: string;
  role: UserRole;
  mustChangePassword: boolean;
};

export type JwtPayload = {
  sub: string;
};
