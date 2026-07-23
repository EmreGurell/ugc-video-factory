import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

const ORG_HEADER = 'x-org-id';

// JwtAuthGuard'dan SONRA çalışmalı (@UseGuards(JwtAuthGuard, OrgGuard)) —
// request.user'ın zaten set edilmiş olmasını bekler.
// Hedef organizasyon: X-Org-Id header'ı varsa o, yoksa JWT'deki active_org_id.
// Her iki durumda da kullanıcının o organizasyona üyeliği doğrulanır ve
// request.org = { organizationId, role } olarak set edilir.
@Injectable()
export class OrgGuard implements CanActivate {
  constructor(private db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const headerOrgId = request.headers[ORG_HEADER];
    const targetOrgId = (Array.isArray(headerOrgId) ? headerOrgId[0] : headerOrgId) || user.active_org_id;

    const membership = await this.db.findMembership(user.id, targetOrgId);
    if (!membership) throw new ForbiddenException('Bu organizasyona erişimin yok');

    request.org = { organizationId: targetOrgId, role: membership.role };
    return true;
  }
}
