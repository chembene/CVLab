import { UserRole } from '@prisma/client';
import { TemplateRecommendationController } from './template-recommendation.controller';
import type { TemplateRecommendationService } from './template-recommendation.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';

describe('TemplateRecommendationController', () => {
  let service: jest.Mocked<TemplateRecommendationService>;
  let controller: TemplateRecommendationController;

  const user: RequestUser = { id: 'user-1', role: UserRole.USER };

  beforeEach(() => {
    service = {
      recommend: jest.fn(),
      list: jest.fn(),
      getOne: jest.fn(),
    } as unknown as jest.Mocked<TemplateRecommendationService>;
    controller = new TemplateRecommendationController(service);
  });

  it('recommend() delegates to the service with the current user as both requester and target', async () => {
    service.recommend.mockResolvedValue({ id: 'rec-1' } as never);
    const dto = { resumeVariantId: 'variant-1' } as never;

    const result = await controller.recommend(user, dto);

    expect(service.recommend).toHaveBeenCalledWith(user, 'user-1', dto);
    expect(result).toEqual({ id: 'rec-1' });
  });

  it('list() delegates to the service for the current user', async () => {
    service.list.mockResolvedValue([]);
    await controller.list(user);
    expect(service.list).toHaveBeenCalledWith(user, 'user-1');
  });

  it('getOne() delegates with the requested id', async () => {
    service.getOne.mockResolvedValue({ id: 'rec-1' } as never);
    await controller.getOne(user, 'rec-1');
    expect(service.getOne).toHaveBeenCalledWith(user, 'user-1', 'rec-1');
  });
});
