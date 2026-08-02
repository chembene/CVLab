import { Injectable } from '@nestjs/common';
import type { MasterResume, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface MasterResumeData {
  title?: string;
  summary?: string;
  careerLevel?: string;
  yearsExperience?: number;
  desiredPosition?: string;
  desiredSalary?: Prisma.Decimal | number;
  currency?: string;
  visibility?: string;
  status?: string;
}

/** Only Prisma access for the `master_resumes` table lives here. */
@Injectable()
export class MasterResumeRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string): Promise<MasterResume | null> {
    return this.prisma.masterResume.findFirst({ where: { userId, deletedAt: null } });
  }

  create(userId: string, data: MasterResumeData): Promise<MasterResume> {
    return this.prisma.masterResume.create({ data: { userId, ...data } });
  }

  update(id: string, data: MasterResumeData): Promise<MasterResume> {
    return this.prisma.masterResume.update({ where: { id }, data });
  }
}
