import { Injectable } from '@nestjs/common';
import type { LinkedInProfile, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { LinkedInProfileContextSnapshot } from './interfaces/linkedin-profile-context.interface';

export interface CreateLinkedInProfileData {
  targetRole?: string;
  headline: string;
  about: string;
  skills: string[];
  experienceSuggestions: string[];
  recommendations: string[];
  contextSnapshot: LinkedInProfileContextSnapshot;
  creditsUsed: number;
  aiRequestId: string;
}

/** Only Prisma access for the `linkedin_profiles` table lives here. */
@Injectable()
export class LinkedInRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, data: CreateLinkedInProfileData): Promise<LinkedInProfile> {
    return this.prisma.linkedInProfile.create({
      data: {
        userId,
        ...data,
        contextSnapshot: data.contextSnapshot as unknown as Prisma.InputJsonValue,
      },
    });
  }

  findAllByUserId(userId: string): Promise<LinkedInProfile[]> {
    return this.prisma.linkedInProfile.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string): Promise<LinkedInProfile | null> {
    return this.prisma.linkedInProfile.findUnique({ where: { id } });
  }
}
