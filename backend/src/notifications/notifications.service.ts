import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private app: admin.app.App | null = null;

  constructor(
    private config: ConfigService,
    private db: DatabaseService,
  ) {}

  onModuleInit() {
    // Railway gibi platformlarda kalıcı dosya sistemi yok — servis hesabı JSON'u
    // doğrudan env değişkeni olarak da verilebilir. Yerelde dosya yolu kullanılır.
    const inlineJson = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (inlineJson) {
      try {
        const serviceAccount = JSON.parse(inlineJson) as admin.ServiceAccount;
        this.app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        this.logger.log('Firebase Admin başlatıldı (env JSON), push bildirimleri aktif');
      } catch (err) {
        this.logger.warn(
          `FIREBASE_SERVICE_ACCOUNT_JSON parse edilemedi — push bildirimleri devre dışı: ${err instanceof Error ? err.message : err}`,
        );
      }
      return;
    }

    const configuredPath =
      this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH') ?? 'firebase-service-account.json';
    const credentialPath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(process.cwd(), configuredPath);

    if (!fs.existsSync(credentialPath)) {
      this.logger.warn(`Firebase service account bulunamadı (${credentialPath}) — push bildirimleri devre dışı`);
      return;
    }

    this.app = admin.initializeApp({ credential: admin.credential.cert(credentialPath) });
    this.logger.log('Firebase Admin başlatıldı (dosya), push bildirimleri aktif');
  }

  async registerToken(userId: string, token: string, platform: string): Promise<void> {
    await this.db.registerDeviceToken(userId, token, platform);
  }

  async sendToUser(
    userId: string,
    notification: { title: string; body: string; data?: Record<string, string> },
  ): Promise<void> {
    if (!this.app) return; // Firebase yapılandırılmamışsa sessizce atla

    const tokens = await this.db.listDeviceTokensForUser(userId);
    if (tokens.length === 0) return;

    const response = await admin.messaging(this.app).sendEachForMulticast({
      tokens: tokens.map((t) => t.token),
      notification: { title: notification.title, body: notification.body },
      data: notification.data,
    });

    const invalidTokens = response.responses
      .map((r, i) => (!r.success && this.isInvalidTokenError(r.error?.code) ? tokens[i].token : null))
      .filter((t): t is string => t !== null);

    if (invalidTokens.length > 0) {
      await this.db.deleteDeviceTokens(invalidTokens);
    }
  }

  private isInvalidTokenError(code?: string): boolean {
    return code === 'messaging/invalid-registration-token' || code === 'messaging/registration-token-not-registered';
  }
}
