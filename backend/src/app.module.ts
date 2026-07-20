import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { JobsModule } from './jobs/jobs.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { DatabaseModule } from './database/database.module';
import { StorageModule } from './storage/storage.module';
import { ReferencesModule } from './references/references.module';
import { AuthModule } from './auth/auth.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
      },
    }),
    DatabaseModule,
    StorageModule,
    AuthModule,
    NotificationsModule,
    PipelineModule,
    JobsModule,
    ReferencesModule,
  ],
})
export class AppModule {}
