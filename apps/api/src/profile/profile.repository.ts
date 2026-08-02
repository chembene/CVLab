import { Injectable } from '@nestjs/common';
import type { Profile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface UpsertProfileData {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  headline?: string;
  phone?: string;
  email?: string;
  country?: string;
  city?: string;
  address?: string;
  birthDate?: Date;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  website?: string;
  photoUrl?: string;
  bio?: string;
}

/** Only Prisma access for the `profiles` table lives here. */
@Injectable()
export class ProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string): Promise<Profile | null> {
    return this.prisma.profile.findFirst({ where: { userId, deletedAt: null } });
  }

  upsert(userId: string, data: UpsertProfileData): Promise<Profile> {
    return this.prisma.profile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }
}
