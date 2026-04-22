import { Controller, Get } from "@nestjs/common";
import { Public } from "../modules/auth/decorators/public.decorator";

@Controller("health")
@Public()
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: "ok",
      service: "yanlu-api",
      timestamp: new Date().toISOString(),
    };
  }
}
