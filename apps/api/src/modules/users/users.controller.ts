import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ChangePhoneDto } from "./dto/change-phone.dto";
import { ChangeUsernameDto } from "./dto/change-username.dto";
import { DeactivateUserDto } from "./dto/deactivate-user.dto";
import { InitialChangePasswordDto } from "./dto/initial-change-password.dto";
import { ListUsersDto } from "./dto/list-users.dto";
import { RegisterUserDto } from "./dto/register-user.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // --- Self-service endpoints (any authenticated user) ---

  @Patch("me/phone")
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateMyPhone(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePhoneDto,
  ): Promise<void> {
    await this.usersService.updatePhoneSelf({
      userId: user.id,
      newPhone: dto.newPhone,
      currentPassword: dto.currentPassword,
    });
  }

  @Patch("me/username")
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateMyUsername(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangeUsernameDto,
  ): Promise<void> {
    await this.usersService.updateUsernameSelf({
      userId: user.id,
      newUsername: dto.newUsername,
    });
  }

  @Patch("me/password")
  @HttpCode(HttpStatus.NO_CONTENT)
  async changeMyPassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.usersService.changePassword({
      userId: user.id,
      oldPassword: dto.oldPassword,
      newPassword: dto.newPassword,
    });
  }

  @Post("me/initial-password-change")
  @HttpCode(HttpStatus.NO_CONTENT)
  async initialChangeMyPassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: InitialChangePasswordDto,
  ): Promise<void> {
    await this.usersService.initialChangePassword({
      userId: user.id,
      newPassword: dto.newPassword,
    });
  }

  @Post("me/deactivate")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivateMe(
    @CurrentUser() user: AuthUser,
    @Body() dto: DeactivateUserDto,
  ): Promise<void> {
    await this.usersService.deactivateSelf({
      userId: user.id,
      phoneConfirmation: dto.phoneConfirmation,
    });
  }

  // --- Admin endpoints ---

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  list(@Query() dto: ListUsersDto) {
    return this.usersService.list({
      page: dto.page,
      pageSize: dto.pageSize,
      keyword: dto.keyword,
      includeDeactivated: dto.includeDeactivated,
    });
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterUserDto) {
    return this.usersService.register({
      operatorId: user.id,
      phone: dto.phone,
      username: dto.username,
      role: dto.role,
    });
  }

  @Patch(":id/role")
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateRole(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<void> {
    await this.usersService.updateRole({
      operatorId: user.id,
      operatorRole: user.role,
      targetId: id,
      newRole: dto.role,
    });
  }

  @Post(":id/reset-password")
  @Roles(UserRole.SUPER_ADMIN)
  resetPassword(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.usersService.resetPassword({
      operatorId: user.id,
      targetId: id,
    });
  }

  @Post(":id/deactivate")
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivateByAdmin(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: DeactivateUserDto,
  ): Promise<void> {
    await this.usersService.deactivateByAdmin({
      operatorId: user.id,
      targetId: id,
      phoneConfirmation: dto.phoneConfirmation,
    });
  }
}
