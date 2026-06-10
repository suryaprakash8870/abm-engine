import { Module } from '@nestjs/common';
import { ScoringModule } from '../scoring/scoring.module';
import { TamService } from './tam.service';
import { GtmController } from './gtm.controller';

@Module({
  imports: [ScoringModule],
  controllers: [GtmController],
  providers: [TamService],
})
export class GtmModule {}
