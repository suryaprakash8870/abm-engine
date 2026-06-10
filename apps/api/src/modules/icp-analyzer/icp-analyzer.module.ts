import { Module } from '@nestjs/common';
import { IcpAnalyzerController } from './icp-analyzer.controller';
import { IcpAnalyzerService } from './icp-analyzer.service';

@Module({
  controllers: [IcpAnalyzerController],
  providers: [IcpAnalyzerService],
})
export class IcpAnalyzerModule {}
