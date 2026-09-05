import type { User } from '@repo/database';

export type SafeUser = Omit<User, 'password'>;

export const SAFE_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;
