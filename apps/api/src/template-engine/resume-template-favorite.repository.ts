import { Injectable } from '@nestjs/common';
import type { ResumeTemplate, ResumeTemplateFavorite } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Only Prisma access for `resume_template_favorites`. */
@Injectable()
export class ResumeTemplateFavoriteRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOne(userId: string, templateId: string): Promise<ResumeTemplateFavorite | null> {
    return this.prisma.resumeTemplateFavorite.findUnique({
      where: { userId_templateId: { userId, templateId } },
    });
  }

  /** Idempotent — favoriting an already-favorited template is a no-op, not a duplicate-key error. */
  async add(userId: string, templateId: string): Promise<ResumeTemplateFavorite> {
    const existing = await this.findOne(userId, templateId);
    if (existing) return existing;
    return this.prisma.resumeTemplateFavorite.create({ data: { userId, templateId } });
  }

  async remove(userId: string, templateId: string): Promise<void> {
    await this.prisma.resumeTemplateFavorite.deleteMany({ where: { userId, templateId } });
  }

  async findAllTemplatesByUserId(userId: string): Promise<ResumeTemplate[]> {
    const favorites = await this.prisma.resumeTemplateFavorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { template: true },
    });
    return favorites.map((f) => f.template);
  }
}
