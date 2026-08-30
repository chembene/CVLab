import { UserRole } from '@prisma/client';
import { CoverLetterController } from './cover-letter.controller';
import type { CoverLetterService } from './cover-letter.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';

describe('CoverLetterController', () => {
  let service: jest.Mocked<CoverLetterService>;
  let controller: CoverLetterController;

  const user: RequestUser = { id: 'user-1', role: UserRole.USER };

  beforeEach(() => {
    service = {
      generate: jest.fn(),
      list: jest.fn(),
      getOne: jest.fn(),
      update: jest.fn(),
      setTemplate: jest.fn(),
      updateTheme: jest.fn(),
      resetTheme: jest.fn(),
      regenerate: jest.fn(),
      duplicate: jest.fn(),
      archive: jest.fn(),
      restore: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<CoverLetterService>;
    controller = new CoverLetterController(service);
  });

  it('generate() delegates to the service with the current user as both requester and target', async () => {
    service.generate.mockResolvedValue({ id: 'cl-1' } as never);
    const dto = { resumeVariantId: 'rv-1', tone: 'PROFESSIONAL', language: 'en' } as never;

    const result = await controller.generate(user, dto);

    expect(service.generate).toHaveBeenCalledWith(user, 'user-1', dto);
    expect(result).toEqual({ id: 'cl-1' });
  });

  it('list() delegates to the service for the current user', async () => {
    service.list.mockResolvedValue([]);
    await controller.list(user);
    expect(service.list).toHaveBeenCalledWith(user, 'user-1');
  });

  it('getOne() delegates with the requested id', async () => {
    service.getOne.mockResolvedValue({ id: 'cl-1' } as never);
    await controller.getOne(user, 'cl-1');
    expect(service.getOne).toHaveBeenCalledWith(user, 'user-1', 'cl-1');
  });

  it('update() delegates with the requested id and body', async () => {
    const dto = { title: 'New' } as never;
    await controller.update(user, 'cl-1', dto);
    expect(service.update).toHaveBeenCalledWith(user, 'user-1', 'cl-1', dto);
  });

  it('setTemplate() delegates with the requested id and templateId', async () => {
    await controller.setTemplate(user, 'cl-1', { templateId: 'cl-modern' } as never);
    expect(service.setTemplate).toHaveBeenCalledWith(user, 'user-1', 'cl-1', 'cl-modern');
  });

  it('updateTheme() delegates with the requested id and body', async () => {
    const dto = { primaryColor: '#000000' } as never;
    await controller.updateTheme(user, 'cl-1', dto);
    expect(service.updateTheme).toHaveBeenCalledWith(user, 'user-1', 'cl-1', dto);
  });

  it('resetTheme() delegates with the requested id', async () => {
    await controller.resetTheme(user, 'cl-1');
    expect(service.resetTheme).toHaveBeenCalledWith(user, 'user-1', 'cl-1');
  });

  it('regenerate() delegates with the requested id', async () => {
    await controller.regenerate(user, 'cl-1');
    expect(service.regenerate).toHaveBeenCalledWith(user, 'user-1', 'cl-1');
  });

  it('duplicate() delegates with the requested id', async () => {
    await controller.duplicate(user, 'cl-1');
    expect(service.duplicate).toHaveBeenCalledWith(user, 'user-1', 'cl-1');
  });

  it('archive() delegates with the requested id', async () => {
    await controller.archive(user, 'cl-1');
    expect(service.archive).toHaveBeenCalledWith(user, 'user-1', 'cl-1');
  });

  it('restore() delegates with the requested id', async () => {
    await controller.restore(user, 'cl-1');
    expect(service.restore).toHaveBeenCalledWith(user, 'user-1', 'cl-1');
  });

  it('remove() delegates with the requested id', async () => {
    await controller.remove(user, 'cl-1');
    expect(service.remove).toHaveBeenCalledWith(user, 'user-1', 'cl-1');
  });
});
