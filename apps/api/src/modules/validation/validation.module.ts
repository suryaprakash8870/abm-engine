import { Module } from '@nestjs/common';
import { CrmAdapterModule } from '../crm-adapter/crm-adapter.module';
import { ValidationController } from './validation.controller';

@Module({
  imports: [CrmAdapterModule],
  controllers: [ValidationController],
})
export class ValidationModule {}
