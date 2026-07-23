import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { OrgGuard } from './org.guard';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, OrgGuard],
  exports: [OrgGuard],
})
export class AuthModule {}
