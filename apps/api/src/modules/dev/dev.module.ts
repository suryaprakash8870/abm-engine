import { Module } from '@nestjs/common';
import { CrmAdapterModule } from '../crm-adapter/crm-adapter.module';
import { ScoringModule } from '../scoring/scoring.module';
import { DevController } from './dev.controller';
import { DevSeedService } from './dev-seed.service';

@Module({
  imports: [CrmAdapterModule, ScoringModule],
  controllers: [DevController],
  providers: [DevSeedService],
})
export class DevModule {}
