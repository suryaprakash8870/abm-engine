import { Module } from '@nestjs/common';
import { CrmAdapterModule } from '../crm-adapter/crm-adapter.module';
import { IcpAnalyzerController } from './icp-analyzer.controller';
import { IcpAnalyzerService } from './icp-analyzer.service';

@Module({
  imports: [CrmAdapterModule],
  controllers: [IcpAnalyzerController],
  providers: [IcpAnalyzerService],
})
export class IcpAnalyzerModule {}
