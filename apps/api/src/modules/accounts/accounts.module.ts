import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

/**
 * Accounts read API. This is the first non-dev endpoint behind the tenant
 * middleware — every call requires an x-org-id header (Phase 1) and will
 * require a Supabase JWT once auth is wired (Phase 1.5).
 */
@Module({
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
