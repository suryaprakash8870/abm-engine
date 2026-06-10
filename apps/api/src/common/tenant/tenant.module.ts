import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantMiddleware } from './tenant.middleware';

@Module({
  imports: [AuthModule],
  providers: [TenantMiddleware],
  exports: [TenantMiddleware],
})
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .exclude('health', 'health/(.*)', 'dev/(.*)', 'icp/(.*)')
      .forRoutes('*');
  }
}
