import { UserRole } from '@prisma/client';
import { AtsAiController } from './ats-ai.controller';
import type { AtsAiService } from './ats-ai.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';

describe('AtsAiController', () => {
  let service: jest.Mocked<AtsAiService>;
  let controller: AtsAiController;

  const user: RequestUser = { id: 'user-1', role: UserRole.USER };

  beforeEach(() => {
    service = {
      analyze: jest.fn(),
      list: jest.fn(),
      getOne: jest.fn(),
    } as unknown as jest.Mocked<AtsAiService>;
    controller = new AtsAiController(service);
  });

  it('analyze() delegates to the service with the current user as both requester and target', async () => {
    service.analyze.mockResolvedValue({ id: 'analysis-1' } as never);
    const dto = { atsReportId: 'report-1' } as never;

    const result = await controller.analyze(user, dto);

    expect(service.analyze).toHaveBeenCalledWith(user, 'user-1', dto);
    expect(result).toEqual({ id: 'analysis-1' });
  });

  it('list() delegates to the service for the current user', async () => {
    service.list.mockResolvedValue([]);
    await controller.list(user);
    expect(service.list).toHaveBeenCalledWith(user, 'user-1');
  });

  it('getOne() delegates with the requested id', async () => {
    service.getOne.mockResolvedValue({ id: 'analysis-1' } as never);
    await controller.getOne(user, 'analysis-1');
    expect(service.getOne).toHaveBeenCalledWith(user, 'user-1', 'analysis-1');
  });
});
