import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { JobTargetStatus, UserRole } from '@prisma/client';
import { JobTargetService } from './job-target.service';
import type { JobTargetRepository } from './job-target.repository';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';

describe('JobTargetService', () => {
  let repository: jest.Mocked<JobTargetRepository>;
  let eventEmitter: { emit: jest.Mock };
  let service: JobTargetService;

  const owner: RequestUser = { id: 'user-1', role: UserRole.USER };
  const stranger: RequestUser = { id: 'user-2', role: UserRole.USER };
  const admin: RequestUser = { id: 'admin-1', role: UserRole.ADMIN };

  beforeEach(() => {
    repository = {
      findAllByUserId: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      replaceKeywords: jest.fn(),
      replaceSkills: jest.fn(),
      replaceLanguages: jest.fn(),
    } as unknown as jest.Mocked<JobTargetRepository>;
    eventEmitter = { emit: jest.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new JobTargetService(repository, eventEmitter as any);
  });

  describe('list / getOne', () => {
    it('denies a non-owner, non-admin user', async () => {
      await expect(service.list(stranger, 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFound when the target does not belong to the requested user', async () => {
      repository.findById.mockResolvedValue({ id: 'jt-1', userId: 'someone-else' } as never);
      await expect(service.getOne(owner, 'user-1', 'jt-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('allows an admin to read another user’s job target', async () => {
      repository.findById.mockResolvedValue({ id: 'jt-1', userId: 'user-1' } as never);
      await expect(service.getOne(admin, 'user-1', 'jt-1')).resolves.toEqual({
        id: 'jt-1',
        userId: 'user-1',
      });
    });
  });

  describe('create', () => {
    it('creates the job target and replaces only the provided child collections', async () => {
      repository.create.mockResolvedValue({ id: 'jt-1' } as never);
      repository.findById.mockResolvedValue({
        id: 'jt-1',
        userId: 'user-1',
        status: JobTargetStatus.DRAFT,
      } as never);

      await service.create(owner, 'user-1', {
        title: 'Backend Engineer',
        skills: [{ skill: 'NestJS', required: true }],
      } as never);

      expect(repository.create).toHaveBeenCalledWith('user-1', { title: 'Backend Engineer' });
      expect(repository.replaceSkills).toHaveBeenCalledWith('jt-1', [
        { skill: 'NestJS', required: true },
      ]);
      expect(repository.replaceKeywords).not.toHaveBeenCalled();
      expect(repository.replaceLanguages).not.toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ entityType: 'job_target', action: 'created' }),
      );
    });
  });

  describe('update', () => {
    it('emits "updated" for a normal field edit', async () => {
      repository.findById
        .mockResolvedValueOnce({
          id: 'jt-1',
          userId: 'user-1',
          status: JobTargetStatus.DRAFT,
        } as never)
        .mockResolvedValueOnce({
          id: 'jt-1',
          userId: 'user-1',
          status: JobTargetStatus.DRAFT,
        } as never);
      repository.update.mockResolvedValue({ id: 'jt-1' } as never);

      await service.update(owner, 'user-1', 'jt-1', { company: 'Acme' } as never);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ action: 'updated' }),
      );
    });

    it('emits "archived" only on the transition into ARCHIVED, not on subsequent edits', async () => {
      repository.findById
        .mockResolvedValueOnce({
          id: 'jt-1',
          userId: 'user-1',
          status: JobTargetStatus.READY,
        } as never)
        .mockResolvedValueOnce({
          id: 'jt-1',
          userId: 'user-1',
          status: JobTargetStatus.ARCHIVED,
        } as never);
      repository.update.mockResolvedValue({ id: 'jt-1' } as never);

      await service.update(owner, 'user-1', 'jt-1', { status: JobTargetStatus.ARCHIVED } as never);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ action: 'archived' }),
      );

      eventEmitter.emit.mockClear();
      repository.findById
        .mockResolvedValueOnce({
          id: 'jt-1',
          userId: 'user-1',
          status: JobTargetStatus.ARCHIVED,
        } as never)
        .mockResolvedValueOnce({
          id: 'jt-1',
          userId: 'user-1',
          status: JobTargetStatus.ARCHIVED,
        } as never);

      await service.update(owner, 'user-1', 'jt-1', { notes: 'still archived' } as never);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ action: 'updated' }),
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes and emits "deleted"', async () => {
      repository.findById.mockResolvedValue({ id: 'jt-1', userId: 'user-1' } as never);

      await service.remove(owner, 'user-1', 'jt-1');

      expect(repository.softDelete).toHaveBeenCalledWith('jt-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ action: 'deleted' }),
      );
    });
  });

  describe('assertOwnedJobTarget', () => {
    it('throws NotFound for a job target owned by someone else', async () => {
      repository.findById.mockResolvedValue({ id: 'jt-1', userId: 'someone-else' } as never);
      await expect(service.assertOwnedJobTarget(owner, 'user-1', 'jt-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('resolves the job target when owned by the target user', async () => {
      repository.findById.mockResolvedValue({ id: 'jt-1', userId: 'user-1' } as never);
      await expect(service.assertOwnedJobTarget(owner, 'user-1', 'jt-1')).resolves.toEqual({
        id: 'jt-1',
        userId: 'user-1',
      });
    });
  });
});
