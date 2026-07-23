import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  UseGuards,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgGuard } from '../auth/org.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../auth/current-user.decorator';
import { CurrentOrg } from '../auth/current-org.decorator';
import type { OrgContext } from '../auth/current-org.decorator';
import { InviteMemberDto } from './dto/invite-member.dto';

// Aktif organizasyon (JWT'deki active_org_id veya X-Org-Id header'ı) bağlamında
// üye yönetimi. Aktif org'u değiştirmek için bkz. POST /auth/switch-org.
@Controller('organizations')
@UseGuards(JwtAuthGuard, OrgGuard)
export class OrganizationsController {
  constructor(private readonly db: DatabaseService) {}

  @Get('members')
  listMembers(@CurrentOrg() org: OrgContext) {
    return this.db.listMembershipsForOrg(org.organizationId);
  }

  // Mobil "Oluştur" ekranının kalan kredi/plan göstergesi için.
  @Get('credits')
  async credits(@CurrentOrg() org: OrgContext) {
    const organization = await this.db.getOrganization(org.organizationId);
    const plan = organization.active_plan_id ? await this.db.getPlanByKey(organization.active_plan_id) : null;
    return {
      credits_remaining: organization.credits_remaining,
      plan: plan ? { key: plan.key, name: plan.name, monthly_credit_allowance: plan.monthly_credit_allowance } : null,
    };
  }

  // Sadece kayıtlı bir kullanıcıyı e-posta ile mevcut org'a ekler — davet
  // e-postası/token akışı henüz yok, bu yüzden kullanıcı önce kendi hesabıyla
  // kayıt olmuş olmalı.
  @Post('invite')
  async invite(@CurrentOrg() org: OrgContext, @Body() dto: InviteMemberDto) {
    if (org.role !== 'owner') throw new ForbiddenException('Sadece organizasyon sahibi üye ekleyebilir');

    const invitee = await this.db.findUserByEmail(dto.email);
    if (!invitee) throw new NotFoundException('Bu e-posta ile kayıtlı bir kullanıcı yok');

    const existing = await this.db.findMembership(invitee.id, org.organizationId);
    if (existing) throw new BadRequestException('Kullanıcı zaten bu organizasyonun üyesi');

    return this.db.createMembership(org.organizationId, invitee.id, dto.role ?? 'member');
  }

  @Delete('leave')
  async leave(@CurrentUser() user: CurrentUserPayload, @CurrentOrg() org: OrgContext) {
    const membershipCount = await this.db.countMembershipsForUser(user.id);
    if (membershipCount <= 1) {
      throw new BadRequestException('Tek organizasyonundan ayrılamazsın');
    }
    await this.db.deleteMembership(org.organizationId, user.id);
    return { ok: true };
  }
}
