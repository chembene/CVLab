import { Injectable } from '@nestjs/common';
import type { Application, ApplicationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ApplicationData {
  resumeId?: string;
  status?: ApplicationStatus;
  appliedAt?: Date;
  interviewDate?: Date;
  result?: string;
  notes?: string;
}

/** Only Prisma access for the `applications` table lives here. */
@Injectable()
export class ApplicationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllByUserId(userId: string): Promise<Application[]> {
    return this.prisma.application.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string): Promise<Application | null> {
    return this.prisma.application.findFirst({ where: { id, deletedAt: null } });
  }

  create(userId: string, jobTargetId: string, data: ApplicationData): Promise<Application> {
    return this.prisma.application.create({ data: { userId, jobTargetId, ...data } });
  }

  update(id: string, data: ApplicationData): Promise<Application> {
    return this.prisma.application.update({ where: { id }, data });
  }

  softDelete(id: string): Promise<Application> {
    return this.prisma.application.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
