import type { Request } from 'express';
import type { UserRole } from '@prisma/client';

export interface RequestUser {
  id: string;
  role: UserRole;
}

export interface RequestWithUser extends Request {
  user: RequestUser;
}
