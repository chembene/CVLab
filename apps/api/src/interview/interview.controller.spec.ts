import { UserRole } from '@prisma/client';
import { InterviewController } from './interview.controller';
import type { InterviewService } from './interview.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';

describe('InterviewController', () => {
  let service: jest.Mocked<InterviewService>;
  let controller: InterviewController;

  const user: RequestUser = { id: 'user-1', role: UserRole.USER };

  beforeEach(() => {
    service = {
      start: jest.fn(),
      generateQuestions: jest.fn(),
      submitAnswer: jest.fn(),
      evaluate: jest.fn(),
      list: jest.fn(),
      getOne: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<InterviewService>;
    controller = new InterviewController(service);
  });

  it('start() delegates to the service with the current user as both requester and target', async () => {
    service.start.mockResolvedValue({ id: 'session-1' } as never);
    const dto = {
      resumeVariantId: 'rv-1',
      type: 'MIXED',
      difficulty: 'SENIOR',
      language: 'en',
    } as never;

    const result = await controller.start(user, dto);

    expect(service.start).toHaveBeenCalledWith(user, 'user-1', dto);
    expect(result).toEqual({ id: 'session-1' });
  });

  it('generateQuestions() delegates with the session id and body', async () => {
    const dto = { questionCount: 8 } as never;
    await controller.generateQuestions(user, 'session-1', dto);
    expect(service.generateQuestions).toHaveBeenCalledWith(user, 'user-1', 'session-1', dto);
  });

  it('submitAnswer() delegates with the session id and body', async () => {
    const dto = { questionId: 'q-1', answer: 'x' } as never;
    await controller.submitAnswer(user, 'session-1', dto);
    expect(service.submitAnswer).toHaveBeenCalledWith(user, 'user-1', 'session-1', dto);
  });

  it('evaluate() delegates with the session id', async () => {
    await controller.evaluate(user, 'session-1');
    expect(service.evaluate).toHaveBeenCalledWith(user, 'user-1', 'session-1');
  });

  it('list() delegates for the current user', async () => {
    service.list.mockResolvedValue([]);
    await controller.list(user);
    expect(service.list).toHaveBeenCalledWith(user, 'user-1');
  });

  it('getOne() delegates with the requested id', async () => {
    service.getOne.mockResolvedValue({ id: 'session-1' } as never);
    await controller.getOne(user, 'session-1');
    expect(service.getOne).toHaveBeenCalledWith(user, 'user-1', 'session-1');
  });

  it('remove() delegates with the requested id', async () => {
    await controller.remove(user, 'session-1');
    expect(service.remove).toHaveBeenCalledWith(user, 'user-1', 'session-1');
  });
});
