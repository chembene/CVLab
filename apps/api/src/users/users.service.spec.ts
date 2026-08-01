import { ConflictException } from '@nestjs/common';
import { UserRole, UserStatus, type User } from '@prisma/client';
import { UsersService } from './users.service';
import type { UsersRepository } from './users.repository';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'jane@example.com',
    phone: null,
    passwordHash: 'hashed-secret',
    status: UserStatus.PENDING_VERIFICATION,
    role: UserRole.USER,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('UsersService', () => {
  let repository: jest.Mocked<UsersRepository>;
  let service: UsersService;

  beforeEach(() => {
    repository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      updateStatus: jest.fn(),
      updatePasswordHash: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;
    service = new UsersService(repository);
  });

  describe('registerUser', () => {
    it('throws ConflictException when the email is already registered', async () => {
      repository.findByEmail.mockResolvedValue(buildUser());

      await expect(
        service.registerUser({ email: 'jane@example.com', passwordHash: 'x' }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(repository.create).not.toHaveBeenCalled();
    });

    it('creates the user with PENDING_VERIFICATION status and USER role, never accepting a caller-supplied role', async () => {
      repository.findByEmail.mockResolvedValue(null);
      repository.create.mockResolvedValue(buildUser());

      await service.registerUser({ email: 'jane@example.com', passwordHash: 'hashed' });

      expect(repository.create).toHaveBeenCalledWith({
        email: 'jane@example.com',
        passwordHash: 'hashed',
        phone: undefined,
        status: UserStatus.PENDING_VERIFICATION,
      });
      // registerUser's own signature has no `role` parameter at all — the
      // absence of a role field above is the actual guarantee, not just this assertion.
    });
  });

  describe('toSafeUser', () => {
    it('never includes passwordHash and maps the remaining fields', () => {
      const user = buildUser({ role: UserRole.ADMIN, status: UserStatus.ACTIVE });

      const safe = service.toSafeUser(user);

      expect(safe).toEqual({
        id: 'user-1',
        email: 'jane@example.com',
        role: 'ADMIN',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      expect(safe).not.toHaveProperty('passwordHash');
    });
  });
});
