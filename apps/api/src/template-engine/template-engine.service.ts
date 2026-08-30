import { Injectable, NotFoundException } from '@nestjs/common';
import type { CoverLetterTemplate, ResumeTemplate } from '@prisma/client';
import { assertOwnerOrAdmin } from '../common/authorization/assert-owner-or-admin.util';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { ResumeTemplateRepository, type ResumeTemplateFilters } from './resume-template.repository';
import {
  CoverLetterTemplateRepository,
  type CoverLetterTemplateFilters,
} from './cover-letter-template.repository';
import { ResumeTemplateFavoriteRepository } from './resume-template-favorite.repository';
import { CoverLetterTemplateFavoriteRepository } from './cover-letter-template-favorite.repository';

const RECENTLY_USED_LIMIT = 5;

/**
 * Read-only catalog access (list/filter/get, both template types) plus
 * owner-scoped favorites — the two things Part 13 actually asks the backend
 * to own. Never renders anything: rendering (layouts, typography, theme
 * resolution) is a frontend-only concern — see
 * docs/architecture/template-engine.md §3 for why the split sits here.
 */
@Injectable()
export class TemplateEngineService {
  constructor(
    private readonly resumeTemplateRepository: ResumeTemplateRepository,
    private readonly coverLetterTemplateRepository: CoverLetterTemplateRepository,
    private readonly resumeTemplateFavoriteRepository: ResumeTemplateFavoriteRepository,
    private readonly coverLetterTemplateFavoriteRepository: CoverLetterTemplateFavoriteRepository,
  ) {}

  listResumeTemplates(filters: ResumeTemplateFilters): Promise<ResumeTemplate[]> {
    return this.resumeTemplateRepository.findAll(filters);
  }

  async getResumeTemplate(id: string): Promise<ResumeTemplate> {
    const template = await this.resumeTemplateRepository.findById(id);
    if (!template) {
      throw new NotFoundException('Modelo de currículo não encontrado.');
    }
    return template;
  }

  listCoverLetterTemplates(filters: CoverLetterTemplateFilters): Promise<CoverLetterTemplate[]> {
    return this.coverLetterTemplateRepository.findAll(filters);
  }

  async getCoverLetterTemplate(id: string): Promise<CoverLetterTemplate> {
    const template = await this.coverLetterTemplateRepository.findById(id);
    if (!template) {
      throw new NotFoundException('Modelo de carta de apresentação não encontrado.');
    }
    return template;
  }

  async listRecentlyUsedResumeTemplates(
    requestingUser: RequestUser,
    targetUserId: string,
  ): Promise<ResumeTemplate[]> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.resumeTemplateRepository.findRecentlyUsedByUserId(
      targetUserId,
      RECENTLY_USED_LIMIT,
    );
  }

  async listRecentlyUsedCoverLetterTemplates(
    requestingUser: RequestUser,
    targetUserId: string,
  ): Promise<CoverLetterTemplate[]> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.coverLetterTemplateRepository.findRecentlyUsedByUserId(
      targetUserId,
      RECENTLY_USED_LIMIT,
    );
  }

  async listFavoriteResumeTemplates(
    requestingUser: RequestUser,
    targetUserId: string,
  ): Promise<ResumeTemplate[]> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.resumeTemplateFavoriteRepository.findAllTemplatesByUserId(targetUserId);
  }

  async favoriteResumeTemplate(
    requestingUser: RequestUser,
    targetUserId: string,
    templateId: string,
  ): Promise<void> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    await this.getResumeTemplate(templateId);
    await this.resumeTemplateFavoriteRepository.add(targetUserId, templateId);
  }

  async unfavoriteResumeTemplate(
    requestingUser: RequestUser,
    targetUserId: string,
    templateId: string,
  ): Promise<void> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    await this.resumeTemplateFavoriteRepository.remove(targetUserId, templateId);
  }

  async listFavoriteCoverLetterTemplates(
    requestingUser: RequestUser,
    targetUserId: string,
  ): Promise<CoverLetterTemplate[]> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.coverLetterTemplateFavoriteRepository.findAllTemplatesByUserId(targetUserId);
  }

  async favoriteCoverLetterTemplate(
    requestingUser: RequestUser,
    targetUserId: string,
    templateId: string,
  ): Promise<void> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    await this.getCoverLetterTemplate(templateId);
    await this.coverLetterTemplateFavoriteRepository.add(targetUserId, templateId);
  }

  async unfavoriteCoverLetterTemplate(
    requestingUser: RequestUser,
    targetUserId: string,
    templateId: string,
  ): Promise<void> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    await this.coverLetterTemplateFavoriteRepository.remove(targetUserId, templateId);
  }
}
