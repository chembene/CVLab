import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { TemplateEngineService } from './template-engine.service';
import type { ResumeTemplateRepository } from './resume-template.repository';
import type { CoverLetterTemplateRepository } from './cover-letter-template.repository';
import type { ResumeTemplateFavoriteRepository } from './resume-template-favorite.repository';
import type { CoverLetterTemplateFavoriteRepository } from './cover-letter-template-favorite.repository';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';

describe('TemplateEngineService', () => {
  let resumeTemplateRepository: jest.Mocked<ResumeTemplateRepository>;
  let coverLetterTemplateRepository: jest.Mocked<CoverLetterTemplateRepository>;
  let resumeTemplateFavoriteRepository: jest.Mocked<ResumeTemplateFavoriteRepository>;
  let coverLetterTemplateFavoriteRepository: jest.Mocked<CoverLetterTemplateFavoriteRepository>;
  let service: TemplateEngineService;

  const owner: RequestUser = { id: 'user-1', role: UserRole.USER };
  const stranger: RequestUser = { id: 'user-2', role: UserRole.USER };

  beforeEach(() => {
    resumeTemplateRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByIdUnfiltered: jest.fn(),
      findRecentlyUsedByUserId: jest.fn(),
    } as unknown as jest.Mocked<ResumeTemplateRepository>;
    coverLetterTemplateRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByIdUnfiltered: jest.fn(),
      findRecentlyUsedByUserId: jest.fn(),
    } as unknown as jest.Mocked<CoverLetterTemplateRepository>;
    resumeTemplateFavoriteRepository = {
      add: jest.fn(),
      remove: jest.fn(),
      findAllTemplatesByUserId: jest.fn(),
    } as unknown as jest.Mocked<ResumeTemplateFavoriteRepository>;
    coverLetterTemplateFavoriteRepository = {
      add: jest.fn(),
      remove: jest.fn(),
      findAllTemplatesByUserId: jest.fn(),
    } as unknown as jest.Mocked<CoverLetterTemplateFavoriteRepository>;
    service = new TemplateEngineService(
      resumeTemplateRepository,
      coverLetterTemplateRepository,
      resumeTemplateFavoriteRepository,
      coverLetterTemplateFavoriteRepository,
    );
  });

  describe('listResumeTemplates / getResumeTemplate', () => {
    it('listResumeTemplates() forwards filters unchanged — no ownership check, it is a shared catalog', async () => {
      resumeTemplateRepository.findAll.mockResolvedValue([{ id: 'modern' } as never]);
      const result = await service.listResumeTemplates({ category: 'MODERN' });
      expect(resumeTemplateRepository.findAll).toHaveBeenCalledWith({ category: 'MODERN' });
      expect(result).toEqual([{ id: 'modern' }]);
    });

    it('getResumeTemplate() throws NotFound for an unknown id', async () => {
      resumeTemplateRepository.findById.mockResolvedValue(null);
      await expect(service.getResumeTemplate('no-such')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listCoverLetterTemplates / getCoverLetterTemplate', () => {
    it('getCoverLetterTemplate() throws NotFound for an unknown id', async () => {
      coverLetterTemplateRepository.findById.mockResolvedValue(null);
      await expect(service.getCoverLetterTemplate('no-such')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('getCoverLetterTemplate() returns the found template', async () => {
      coverLetterTemplateRepository.findById.mockResolvedValue({ id: 'cl-modern' } as never);
      const result = await service.getCoverLetterTemplate('cl-modern');
      expect(result).toEqual({ id: 'cl-modern' });
    });
  });

  describe('recently used', () => {
    it('listRecentlyUsedResumeTemplates() denies a non-owner, non-admin user', async () => {
      await expect(
        service.listRecentlyUsedResumeTemplates(stranger, 'user-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(resumeTemplateRepository.findRecentlyUsedByUserId).not.toHaveBeenCalled();
    });

    it('listRecentlyUsedResumeTemplates() delegates to the repository for the target user', async () => {
      resumeTemplateRepository.findRecentlyUsedByUserId.mockResolvedValue([
        { id: 'modern' } as never,
      ]);
      const result = await service.listRecentlyUsedResumeTemplates(owner, 'user-1');
      expect(resumeTemplateRepository.findRecentlyUsedByUserId).toHaveBeenCalledWith('user-1', 5);
      expect(result).toEqual([{ id: 'modern' }]);
    });

    it('listRecentlyUsedCoverLetterTemplates() delegates to the repository', async () => {
      coverLetterTemplateRepository.findRecentlyUsedByUserId.mockResolvedValue([
        { id: 'cl-modern' } as never,
      ]);
      await service.listRecentlyUsedCoverLetterTemplates(owner, 'user-1');
      expect(coverLetterTemplateRepository.findRecentlyUsedByUserId).toHaveBeenCalledWith(
        'user-1',
        5,
      );
    });
  });

  describe('resume template favorites', () => {
    it('favoriteResumeTemplate() denies a non-owner, non-admin user', async () => {
      await expect(
        service.favoriteResumeTemplate(stranger, 'user-1', 'modern'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(resumeTemplateFavoriteRepository.add).not.toHaveBeenCalled();
    });

    it('favoriteResumeTemplate() throws NotFound when the template does not exist', async () => {
      resumeTemplateRepository.findById.mockResolvedValue(null);
      await expect(
        service.favoriteResumeTemplate(owner, 'user-1', 'no-such'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(resumeTemplateFavoriteRepository.add).not.toHaveBeenCalled();
    });

    it('favoriteResumeTemplate() adds the favorite once the template is confirmed to exist', async () => {
      resumeTemplateRepository.findById.mockResolvedValue({ id: 'modern' } as never);
      await service.favoriteResumeTemplate(owner, 'user-1', 'modern');
      expect(resumeTemplateFavoriteRepository.add).toHaveBeenCalledWith('user-1', 'modern');
    });

    it('unfavoriteResumeTemplate() removes without requiring the template to still exist', async () => {
      await service.unfavoriteResumeTemplate(owner, 'user-1', 'modern');
      expect(resumeTemplateFavoriteRepository.remove).toHaveBeenCalledWith('user-1', 'modern');
    });

    it('listFavoriteResumeTemplates() denies a non-owner, non-admin user', async () => {
      await expect(service.listFavoriteResumeTemplates(stranger, 'user-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('cover letter template favorites', () => {
    it('favoriteCoverLetterTemplate() throws NotFound when the template does not exist', async () => {
      coverLetterTemplateRepository.findById.mockResolvedValue(null);
      await expect(
        service.favoriteCoverLetterTemplate(owner, 'user-1', 'no-such'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('favoriteCoverLetterTemplate() adds the favorite once confirmed to exist', async () => {
      coverLetterTemplateRepository.findById.mockResolvedValue({ id: 'cl-modern' } as never);
      await service.favoriteCoverLetterTemplate(owner, 'user-1', 'cl-modern');
      expect(coverLetterTemplateFavoriteRepository.add).toHaveBeenCalledWith('user-1', 'cl-modern');
    });

    it('unfavoriteCoverLetterTemplate() removes the favorite', async () => {
      await service.unfavoriteCoverLetterTemplate(owner, 'user-1', 'cl-modern');
      expect(coverLetterTemplateFavoriteRepository.remove).toHaveBeenCalledWith(
        'user-1',
        'cl-modern',
      );
    });
  });
});
