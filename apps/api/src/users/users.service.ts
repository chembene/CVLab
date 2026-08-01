import { ConflictException, Injectable } from '@nestjs/common';
import { UserStatus, type User } from '@prisma/client';
import type {
  SafeUser,
  UserRole as SharedUserRole,
  UserStatus as SharedUserStatus,
} from '@cvlab/types';
import { UsersRepository } from './users.repository';

export interface RegisterUserInput {
  email: string;
  passwordHash: string;
  phone?: string;
}

/**
 * Owns user identity: uniqueness, status transitions, and the only place
 * allowed to create a User row. Registration always creates `role: USER` —
 * there is no code path here that accepts a caller-supplied role, which is
 * what makes "users can never change their own role" true by construction
 * (see prompts task §14 / security-architecture.md).
 */
@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findByEmail(email);
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findById(id);
  }

  async registerUser(input: RegisterUserInput): Promise<User> {
    const existing = await this.usersRepository.findByEmail(input.email);
    if (existing) {
      throw new ConflictException('Email already in use.');
    }

    return this.usersRepository.create({
      email: input.email,
      passwordHash: input.passwordHash,
      phone: input.phone,
      status: UserStatus.PENDING_VERIFICATION,
    });
  }

  setStatus(id: string, status: UserStatus): Promise<User> {
    return this.usersRepository.updateStatus(id, status);
  }

  updatePasswordHash(id: string, passwordHash: string): Promise<User> {
    return this.usersRepository.updatePasswordHash(id, passwordHash);
  }

  /**
   * Never includes passwordHash — the only user shape allowed to cross the
   * API boundary. The double-cast bridges Prisma's generated enum types and
   * @cvlab/types' mirrored enums: both are value-identical string enums
   * declared independently (see packages/types/src/enums.ts), so they are
   * runtime-compatible but not structurally assignable in TypeScript.
   */
  toSafeUser(user: User): SafeUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role as unknown as SharedUserRole,
      status: user.status as unknown as SharedUserStatus,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
