import { Module } from '@nestjs/common';
import { PipelineService } from './pipeline.service';
import { ClaudeService } from './claude.service';
import { OverlayService } from './overlay.service';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { ProvidersModule } from '../providers/providers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [DatabaseModule, StorageModule, ProvidersModule, NotificationsModule, BillingModule],
  providers: [PipelineService, ClaudeService, OverlayService],
  exports: [PipelineService, ClaudeService],
})
export class PipelineModule {}
