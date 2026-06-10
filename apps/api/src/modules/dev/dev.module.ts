import { Module } from '@nestjs/common';
import { CrmAdapterModule } from '../crm-adapter/crm-adapter.module';
import { DevController } from './dev.controller';

@Module({
  imports: [CrmAdapterModule],
  controllers: [DevController],
})
export class DevModule {}
