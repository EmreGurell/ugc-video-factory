import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Plan } from '../database/database.service';

// RevenueCat REST API "Get Subscriber" — https://www.revenuecat.com/docs/api-v1#tag/subscribers
interface RevenueCatEntitlement {
  expires_date: string | null;
  product_identifier: string;
}

interface RevenueCatSubscriberResponse {
  subscriber: {
    entitlements: Record<string, RevenueCatEntitlement>;
  };
}

@Injectable()
export class RevenueCatService {
  private readonly logger = new Logger(RevenueCatService.name);

  constructor(private config: ConfigService) {}

  isConfigured(): boolean {
    return !!this.config.get<string>('REVENUECAT_API_KEY');
  }

  getWebhookSecret(): string | undefined {
    return this.config.get<string>('REVENUECAT_WEBHOOK_SECRET');
  }

  // Webhook body'sine tam güvenmemek için kanonik durumu RevenueCat'ten çeker.
  async getSubscriber(appUserId: string): Promise<RevenueCatSubscriberResponse> {
    const apiKey = this.config.getOrThrow<string>('REVENUECAT_API_KEY');
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      throw new Error(`RevenueCat get-subscriber failed: ${res.status} ${await res.text()}`);
    }
    return res.json() as Promise<RevenueCatSubscriberResponse>;
  }

  // Aktif (süresi geçmemiş) entitlement'lardan, product_identifier'ı bir Plan'ın
  // revenuecat_product_ids listesiyle eşleşen en yüksek krediyi veren planı bulur.
  // Hiçbiri aktif değilse null döner (org free'ye düşürülmeli).
  resolveActivePlan(subscriber: RevenueCatSubscriberResponse, plans: Plan[]): Plan | null {
    const now = Date.now();
    const activeProductIds = new Set(
      Object.values(subscriber.subscriber.entitlements)
        .filter((e) => !e.expires_date || new Date(e.expires_date).getTime() > now)
        .map((e) => e.product_identifier),
    );
    if (activeProductIds.size === 0) return null;

    const matching = plans
      .filter((p) => p.revenuecat_product_ids.some((id) => activeProductIds.has(id)))
      .sort((a, b) => b.monthly_credit_allowance - a.monthly_credit_allowance);
    return matching[0] ?? null;
  }
}
