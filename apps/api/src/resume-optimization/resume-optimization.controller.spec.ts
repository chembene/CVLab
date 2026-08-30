import { UserRole } from '@prisma/client';
import { ResumeOptimizationController } from './resume-optimization.controller';
import type { ResumeOptimizationService } from './resume-optimization.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';

describe('ResumeOptimizationController', () => {
  let service: jest.Mocked<ResumeOptimizationService>;
  let controller: ResumeOptimizationController;

  const user: RequestUser = { id: 'user-1', role: UserRole.USER };

  beforeEach(() => {
    service = {
      run: jest.fn(),
      list: jest.fn(),
      getOne: jest.fn(),
      apply: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<ResumeOptimizationService>;
    controller = new ResumeOptimizationController(service);
  });

  it('run() delegates to the service with the current user as both requester and target', async () => {
    service.run.mockResolvedValue({ id: 'opt-1' } as never);

    const result = await controller.run(user, { resumeVariantId: 'rv-1' });

    expect(service.run).toHaveBeenCalledWith(user, 'user-1', { resumeVariantId: 'rv-1' });
    expect(result).toEqual({ id: 'opt-1' });
  });

  it('run() forwards the optional force flag', async () => {
    service.run.mockResolvedValue({ id: 'opt-1' } as never);

    await controller.run(user, { resumeVariantId: 'rv-1', force: true });

    expect(service.run).toHaveBeenCalledWith(user, 'user-1', {
      resumeVariantId: 'rv-1',
      force: true,
    });
  });

  it('list() delegates to the service for the current user', async () => {
    service.list.mockResolvedValue([]);

    await controller.list(user);

    expect(service.list).toHaveBeenCalledWith(user, 'user-1');
  });

  it('getOne() delegates with the requested id', async () => {
    service.getOne.mockResolvedValue({ id: 'opt-1' } as never);

    await controller.getOne(user, 'opt-1');

    expect(service.getOne).toHaveBeenCalledWith(user, 'user-1', 'opt-1');
  });

  it('apply() delegates with the requested id and suggestionIds body', async () => {
    service.apply.mockResolvedValue({ appliedSuggestionIds: ['s1'] } as never);

    const result = await controller.apply(user, 'opt-1', { suggestionIds: ['s1'] });

    expect(service.apply).toHaveBeenCalledWith(user, 'user-1', 'opt-1', { suggestionIds: ['s1'] });
    expect(result).toEqual({ appliedSuggestionIds: ['s1'] });
  });

  it('remove() delegates with the requested id', async () => {
    await controller.remove(user, 'opt-1');

    expect(service.remove).toHaveBeenCalledWith(user, 'user-1', 'opt-1');
  });
});
