import { Module } from '@nestjs/common';
import { ReferencesController } from './references.controller';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { PipelineModule } from '../pipeline/pipeline.module';
import { ProvidersModule } from '../providers/providers.module';

@Module({
  imports: [DatabaseModule, StorageModule, PipelineModule, ProvidersModule],
  controllers: [ReferencesController],
})
export class ReferencesModule {}
