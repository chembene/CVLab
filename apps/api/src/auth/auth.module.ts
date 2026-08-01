import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { SessionsRepository } from './sessions/sessions.repository';
import { SessionsService } from './sessions/sessions.service';
import { VerificationRepository } from './verification/verification.repository';
import { VerificationService } from './verification/verification.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    UsersModule,
    // Secrets/expirations are passed explicitly per sign/verify call (see
    // TokenService), so no global JwtModule options are needed here.
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    SessionsRepository,
    SessionsService,
    VerificationRepository,
    VerificationService,
    JwtAuthGuard,
    RolesGuard,
  ],
  // Exported so future modules (e.g. Admin in a later phase) can protect
  // their own routes with the same guards without redefining them.
  exports: [JwtAuthGuard, RolesGuard, TokenService],
})
export class AuthModule {}
