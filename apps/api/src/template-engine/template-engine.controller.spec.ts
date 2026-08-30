import { UserRole } from '@prisma/client';
import { TemplateEngineController } from './template-engine.controller';
import type { TemplateEngineService } from './template-engine.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';

describe('TemplateEngineController', () => {
  let service: jest.Mocked<TemplateEngineService>;
  let controller: TemplateEngineController;

  const user: RequestUser = { id: 'user-1', role: UserRole.USER };

  beforeEach(() => {
    service = {
      listResumeTemplates: jest.fn(),
      getResumeTemplate: jest.fn(),
      listCoverLetterTemplates: jest.fn(),
      getCoverLetterTemplate: jest.fn(),
      listRecentlyUsedResumeTemplates: jest.fn(),
      listRecentlyUsedCoverLetterTemplates: jest.fn(),
      listFavoriteResumeTemplates: jest.fn(),
      favoriteResumeTemplate: jest.fn(),
      unfavoriteResumeTemplate: jest.fn(),
      listFavoriteCoverLetterTemplates: jest.fn(),
      favoriteCoverLetterTemplate: jest.fn(),
      unfavoriteCoverLetterTemplate: jest.fn(),
    } as unknown as jest.Mocked<TemplateEngineService>;
    controller = new TemplateEngineController(service);
  });

  it('listResumeTemplates() delegates the query filters unchanged', async () => {
    const query = { category: 'MODERN' } as never;
    await controller.listResumeTemplates(query);
    expect(service.listResumeTemplates).toHaveBeenCalledWith(query);
  });

  it('getResumeTemplate() delegates with the requested id', async () => {
    await controller.getResumeTemplate('modern');
    expect(service.getResumeTemplate).toHaveBeenCalledWith('modern');
  });

  it('listFavoriteResumeTemplates() delegates with the current user as both requester and target', async () => {
    await controller.listFavoriteResumeTemplates(user);
    expect(service.listFavoriteResumeTemplates).toHaveBeenCalledWith(user, 'user-1');
  });

  it('listRecentlyUsedResumeTemplates() delegates with the current user', async () => {
    await controller.listRecentlyUsedResumeTemplates(user);
    expect(service.listRecentlyUsedResumeTemplates).toHaveBeenCalledWith(user, 'user-1');
  });

  it('favoriteResumeTemplate() delegates and returns a confirmation payload', async () => {
    const result = await controller.favoriteResumeTemplate(user, 'modern');
    expect(service.favoriteResumeTemplate).toHaveBeenCalledWith(user, 'user-1', 'modern');
    expect(result).toEqual({ favorited: true });
  });

  it('unfavoriteResumeTemplate() delegates and returns a confirmation payload', async () => {
    const result = await controller.unfavoriteResumeTemplate(user, 'modern');
    expect(service.unfavoriteResumeTemplate).toHaveBeenCalledWith(user, 'user-1', 'modern');
    expect(result).toEqual({ favorited: false });
  });

  it('listCoverLetterTemplates() delegates the query filters unchanged', async () => {
    const query = { premium: false } as never;
    await controller.listCoverLetterTemplates(query);
    expect(service.listCoverLetterTemplates).toHaveBeenCalledWith(query);
  });

  it('getCoverLetterTemplate() delegates with the requested id', async () => {
    await controller.getCoverLetterTemplate('cl-modern');
    expect(service.getCoverLetterTemplate).toHaveBeenCalledWith('cl-modern');
  });

  it('favoriteCoverLetterTemplate() delegates and returns a confirmation payload', async () => {
    const result = await controller.favoriteCoverLetterTemplate(user, 'cl-modern');
    expect(service.favoriteCoverLetterTemplate).toHaveBeenCalledWith(user, 'user-1', 'cl-modern');
    expect(result).toEqual({ favorited: true });
  });

  it('unfavoriteCoverLetterTemplate() delegates and returns a confirmation payload', async () => {
    const result = await controller.unfavoriteCoverLetterTemplate(user, 'cl-modern');
    expect(service.unfavoriteCoverLetterTemplate).toHaveBeenCalledWith(user, 'user-1', 'cl-modern');
    expect(result).toEqual({ favorited: false });
  });
});
