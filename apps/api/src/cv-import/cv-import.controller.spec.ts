import { UserRole } from '@prisma/client';
import { CvImportController } from './cv-import.controller';
import type { CvImportService } from './cv-import.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';

describe('CvImportController', () => {
  let service: jest.Mocked<CvImportService>;
  let controller: CvImportController;

  const user: RequestUser = { id: 'user-1', role: UserRole.USER };

  beforeEach(() => {
    service = {
      upload: jest.fn(),
      list: jest.fn(),
      getOne: jest.fn(),
      previewMerge: jest.fn(),
      confirm: jest.fn(),
      discard: jest.fn(),
      remove: jest.fn(),
      enhanceWithAi: jest.fn(),
    } as unknown as jest.Mocked<CvImportService>;
    controller = new CvImportController(service);
  });

  it('upload() delegates to the service with the current user as both requester and target', async () => {
    const file = { originalname: 'cv.pdf' } as Express.Multer.File;
    service.upload.mockResolvedValue({ id: 'cvi-1' } as never);

    const result = await controller.upload(user, file);

    expect(service.upload).toHaveBeenCalledWith(user, 'user-1', file);
    expect(result).toEqual({ id: 'cvi-1' });
  });

  it('list() delegates to the service for the current user', async () => {
    service.list.mockResolvedValue([]);
    await controller.list(user);
    expect(service.list).toHaveBeenCalledWith(user, 'user-1');
  });

  it('getOne() delegates with the requested id', async () => {
    service.getOne.mockResolvedValue({ id: 'cvi-1' } as never);
    await controller.getOne(user, 'cvi-1');
    expect(service.getOne).toHaveBeenCalledWith(user, 'user-1', 'cvi-1');
  });

  it('previewMerge() delegates with the requested id', async () => {
    service.previewMerge.mockResolvedValue({} as never);
    await controller.previewMerge(user, 'cvi-1');
    expect(service.previewMerge).toHaveBeenCalledWith(user, 'user-1', 'cvi-1');
  });

  it('confirm() delegates with the requested id and body', async () => {
    const dto = { summary: 'edited' } as never;
    service.confirm.mockResolvedValue({} as never);
    await controller.confirm(user, 'cvi-1', dto);
    expect(service.confirm).toHaveBeenCalledWith(user, 'user-1', 'cvi-1', dto);
  });

  it('discard() delegates with the requested id', async () => {
    service.discard.mockResolvedValue({} as never);
    await controller.discard(user, 'cvi-1');
    expect(service.discard).toHaveBeenCalledWith(user, 'user-1', 'cvi-1');
  });

  it('remove() delegates with the requested id', async () => {
    await controller.remove(user, 'cvi-1');
    expect(service.remove).toHaveBeenCalledWith(user, 'user-1', 'cvi-1');
  });

  it('enhanceWithAi() delegates with the requested id (FASE 22)', async () => {
    service.enhanceWithAi.mockResolvedValue({ id: 'cvi-1' } as never);
    const result = await controller.enhanceWithAi(user, 'cvi-1');
    expect(service.enhanceWithAi).toHaveBeenCalledWith(user, 'user-1', 'cvi-1');
    expect(result).toEqual({ id: 'cvi-1' });
  });
});
