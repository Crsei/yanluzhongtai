import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { validateEnvironment } from "./config/env.validation";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { IdSequenceModule } from "./common/id-sequence/id-sequence.module";
import { AuthModule } from "./modules/auth/auth.module";
import { JwtAuthGuard } from "./modules/auth/guards/jwt-auth.guard";
import { MustChangePasswordGuard } from "./modules/auth/guards/must-change-password.guard";
import { RolesGuard } from "./modules/auth/guards/roles.guard";
import { UsersModule } from "./modules/users/users.module";
import { StorageModule } from "./modules/storage/storage.module";
import { AuditLogsModule } from "./modules/audit-logs/audit-logs.module";
import { EmployeesModule } from "./modules/employees/employees.module";
import { StudentsModule } from "./modules/students/students.module";
import { CourseOutlinesModule } from "./modules/course-outlines/course-outlines.module";
import { CoursesModule } from "./modules/courses/courses.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["apps/api/.env", ".env"],
      validate: validateEnvironment,
    }),
    PrismaModule,
    IdSequenceModule,
    StorageModule,
    AuditLogsModule,
    EmployeesModule,
    StudentsModule,
    CourseOutlinesModule,
    CoursesModule,
    UsersModule,
    AuthModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: MustChangePasswordGuard,
    },
  ],
})
export class AppModule {}
