import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CostTrackingService } from './cost-tracking.service';
import { RevenueCatService } from './revenuecat.service';
import { RevenueCatWebhookController } from './revenuecat-webhook.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [RevenueCatWebhookController],
  providers: [CostTrackingService, RevenueCatService],
  exports: [CostTrackingService],
})
export class BillingModule {}
