import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { SwitchOrgDto } from './dto/switch-org.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { CurrentUserPayload } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refresh_token);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refresh_token);
    return { ok: true };
  }

  // Aktif organizasyonu değiştirir — üyelik doğrulanır, o org'a bağlı yeni
  // bir token çifti döner. Mobil bu çifti mevcut token'ların yerine kaydeder.
  @Post('switch-org')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  switchOrg(@CurrentUser() user: CurrentUserPayload, @Body() dto: SwitchOrgDto) {
    return this.auth.switchOrganization(user.id, dto.organization_id);
  }
}
