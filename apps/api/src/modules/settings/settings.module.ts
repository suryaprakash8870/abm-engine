import { Module } from '@nestjs/common';
import { CrmSyncModule } from '../crm-sync/crm-sync.module';
import { SettingsController } from './settings.controller';

@Module({
  imports: [CrmSyncModule],
  controllers: [SettingsController],
})
export class SettingsModule {}
