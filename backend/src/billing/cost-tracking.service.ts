import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class CostTrackingService {
  private readonly logger = new Logger(CostTrackingService.name);

  constructor(private db: DatabaseService) {}

  // Best-effort: maliyet kaydı hatası pipeline'ı düşürmemeli, sadece loglanır.
  async record(jobId: string, organizationId: string, provider: string, operation: string, unitCostUsd: number): Promise<void> {
    try {
      await this.db.recordProviderCost({
        job_id: jobId,
        organization_id: organizationId,
        provider,
        operation,
        unit_cost_usd: unitCostUsd,
      });
    } catch (err) {
      this.logger.warn(`[${jobId}] Maliyet kaydı yazılamadı (${provider}/${operation}): ${err instanceof Error ? err.message : err}`);
    }
  }
}
