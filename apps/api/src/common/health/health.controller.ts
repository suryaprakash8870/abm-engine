import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  status() {
    return { ok: true, service: 'abm-api', ts: new Date().toISOString() };
  }
}
