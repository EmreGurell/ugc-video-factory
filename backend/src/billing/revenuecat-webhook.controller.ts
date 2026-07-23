import { Controller, Post, Headers, Body, HttpCode, HttpStatus, UnauthorizedException, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RevenueCatService } from './revenuecat.service';

// Yeni satın alma/yenilemede tam aylık kredi allowance'ına sıfırlanır.
// CANCELLATION/BILLING_ISSUE gibi diğer event'lerde sadece plan senkronize
// edilir — kredi, dönem bitene kadar (EXPIRATION gelene kadar) dokunulmaz.
const CREDIT_RESET_EVENT_TYPES = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'TRANSFER']);

interface RevenueCatWebhookBody {
  event?: {
    id: string;
    type: string;
    app_user_id: string;
  };
}

// app_user_id === organization_id olacak şekilde mobil SDK Purchases.logIn(organizationId)
// çağıracak (Faz 7) — bu yüzden satın alma her zaman bireysel kullanıcıya değil
// paylaşımlı org'a bağlanır. Bkz. plan dosyası Faz 4/7.
@Controller('billing/revenuecat')
export class RevenueCatWebhookController {
  private readonly logger = new Logger(RevenueCatWebhookController.name);

  constructor(
    private db: DatabaseService,
    private revenuecat: RevenueCatService,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Headers('authorization') authHeader: string | undefined, @Body() body: RevenueCatWebhookBody) {
    const expectedSecret = this.revenuecat.getWebhookSecret();
    if (!expectedSecret) {
      this.logger.warn('REVENUECAT_WEBHOOK_SECRET tanımlı değil — webhook reddedildi');
      throw new UnauthorizedException();
    }
    if (authHeader !== expectedSecret) {
      throw new UnauthorizedException();
    }

    const event = body.event;
    if (!event?.id || !event.app_user_id) {
      this.logger.warn('Geçersiz RevenueCat webhook body, yok sayılıyor');
      return { ok: true };
    }

    const organizationId = event.app_user_id;
    const isNew = await this.db.markWebhookEventProcessedIfNew(event.id, event.type, organizationId);
    if (!isNew) {
      this.logger.log(`Event zaten işlenmiş, atlanıyor: ${event.id}`);
      return { ok: true };
    }

    try {
      await this.syncOrganization(organizationId, event.type);
    } catch (err) {
      // 200 yine de dönülür: event.id işlendi olarak işaretlendi, RevenueCat
      // retry etmeyecek — senkron hatası burada sessizce loglanır, tekrar
      // denemek için event'in idempotency kaydını silmek gerekirdi ki bu
      // riskli (aynı event'in iki kez farklı sonuç üretmesi).
      this.logger.error(
        `Org senkronizasyonu başarısız (org=${organizationId}, event=${event.type}): ${err instanceof Error ? err.message : err}`,
      );
    }
    return { ok: true };
  }

  private async syncOrganization(organizationId: string, eventType: string): Promise<void> {
    if (!this.revenuecat.isConfigured()) {
      this.logger.warn('REVENUECAT_API_KEY tanımlı değil — senkronizasyon atlanıyor');
      return;
    }

    let org;
    try {
      org = await this.db.getOrganization(organizationId);
    } catch {
      this.logger.warn(`Bilinmeyen organizasyon (app_user_id): ${organizationId}`);
      return;
    }

    const [subscriber, plans] = await Promise.all([this.revenuecat.getSubscriber(organizationId), this.db.listPlans()]);
    const activePlan = this.revenuecat.resolveActivePlan(subscriber, plans);
    const freePlan = plans.find((p) => p.key === 'free');
    const targetPlan = activePlan ?? freePlan;
    if (!targetPlan) {
      this.logger.warn('"free" planı seed edilmemiş — senkronizasyon atlanıyor');
      return;
    }

    const isDowngradeToFree = !activePlan && org.active_plan_id !== 'free';
    const shouldResetCredits = CREDIT_RESET_EVENT_TYPES.has(eventType) || isDowngradeToFree;

    await this.db.updateOrganizationBilling(organizationId, {
      active_plan_id: targetPlan.key,
      revenuecat_app_user_id: organizationId,
      ...(shouldResetCredits ? { credits_remaining: targetPlan.monthly_credit_allowance, credits_period_start: new Date() } : {}),
    });
    this.logger.log(`[${organizationId}] RevenueCat sync: ${eventType} → plan=${targetPlan.key} kredi_sıfırlandı=${shouldResetCredits}`);
  }
}
