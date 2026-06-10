import { Module } from '@nestjs/common';
import { ScoringModule } from '../scoring/scoring.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

/**
 * Accounts read API. The first non-dev endpoint behind the tenant middleware —
 * every call requires an x-org-id header (Phase 1) and will require a
 * Supabase JWT once auth is wired (Phase 1.5).
 *
 * Imports ScoringModule so the detail endpoint can ask the scorer to explain
 * an account's score on demand against the live rubric.
 */
@Module({
  imports: [ScoringModule],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
