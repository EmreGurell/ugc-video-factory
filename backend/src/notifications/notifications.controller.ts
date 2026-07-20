import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { RegisterTokenDto } from './dto/register-token.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../auth/current-user.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('register-token')
  async registerToken(@CurrentUser() user: CurrentUserPayload, @Body() dto: RegisterTokenDto) {
    await this.notifications.registerToken(user.id, dto.token, dto.platform ?? 'android');
    return { ok: true };
  }
}
