import { Injectable } from '@nestjs/common';
import type { CoverLetterTemplate, CoverLetterTemplateFavorite } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Only Prisma access for `cover_letter_template_favorites`. */
@Injectable()
export class CoverLetterTemplateFavoriteRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOne(userId: string, templateId: string): Promise<CoverLetterTemplateFavorite | null> {
    return this.prisma.coverLetterTemplateFavorite.findUnique({
      where: { userId_templateId: { userId, templateId } },
    });
  }

  async add(userId: string, templateId: string): Promise<CoverLetterTemplateFavorite> {
    const existing = await this.findOne(userId, templateId);
    if (existing) return existing;
    return this.prisma.coverLetterTemplateFavorite.create({ data: { userId, templateId } });
  }

  async remove(userId: string, templateId: string): Promise<void> {
    await this.prisma.coverLetterTemplateFavorite.deleteMany({ where: { userId, templateId } });
  }

  async findAllTemplatesByUserId(userId: string): Promise<CoverLetterTemplate[]> {
    const favorites = await this.prisma.coverLetterTemplateFavorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { template: true },
    });
    return favorites.map((f) => f.template);
  }
}
