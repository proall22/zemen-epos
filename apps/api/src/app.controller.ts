import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './auth/public.decorator';

@ApiTags('App')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  @ApiOkResponse({
    description:
      'Root marker. Real health checks live at /healthz (readiness) and /livez (liveness).',
    type: String,
  })
  getHello(): string {
    return this.appService.getHello();
  }
}
