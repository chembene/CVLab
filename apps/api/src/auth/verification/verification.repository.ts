import { Injectable } from '@nestjs/common';
import type { PasswordResetToken, VerificationToken } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Only Prisma access for verification_tokens / password_reset_tokens lives here. */
@Injectable()
export class VerificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  createEmailVerificationToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<VerificationToken> {
    return this.prisma.verificationToken.create({ data });
  }

  findEmailVerificationTokenByHash(tokenHash: string): Promise<VerificationToken | null> {
    return this.prisma.verificationToken.findUnique({ where: { tokenHash } });
  }

  consumeEmailVerificationToken(id: string): Promise<VerificationToken> {
    return this.prisma.verificationToken.update({
      where: { id },
      data: { consumedAt: new Date() },
    });
  }

  createPasswordResetToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetToken> {
    return this.prisma.passwordResetToken.create({ data });
  }

  findPasswordResetTokenByHash(tokenHash: string): Promise<PasswordResetToken | null> {
    return this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  }

  consumePasswordResetToken(id: string): Promise<PasswordResetToken> {
    return this.prisma.passwordResetToken.update({
      where: { id },
      data: { consumedAt: new Date() },
    });
  }
}
