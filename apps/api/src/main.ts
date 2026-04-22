import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>("PORT", 3000);
  const origin = configService.get<string>("APP_ORIGIN", "*");

  app.setGlobalPrefix("api");
  app.enableCors({
    origin,
    credentials: true,
  });

  await app.listen(port);
}

bootstrap();

