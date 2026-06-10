import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { TenantMiddleware } from './tenant.middleware';

@Module({
  providers: [TenantMiddleware],
  exports: [TenantMiddleware],
})
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .exclude('health', 'health/(.*)', 'dev/(.*)')
      .forRoutes('*');
  }
}
