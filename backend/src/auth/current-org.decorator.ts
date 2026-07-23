import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { MembershipRole } from '../database/database.service';

export interface OrgContext {
  organizationId: string;
  role: MembershipRole;
}

// OrgGuard tarafından request.org'a yazılır — @UseGuards(JwtAuthGuard, OrgGuard)
// uygulanmış bir controller'da kullanılmalı.
export const CurrentOrg = createParamDecorator((_data: unknown, ctx: ExecutionContext): OrgContext => {
  const request = ctx.switchToHttp().getRequest();
  return request.org;
});
