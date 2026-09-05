import { Role } from '@repo/database';

export const Permissions = {
  user: ['user:read', 'user:update'],
  admin: ['user:read', 'user:update', 'user:delete'],
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions][number];

type RolePermissions = {
  [K in Role]: readonly Permission[];
};

export const ROLE_PERMISSIONS: RolePermissions = {
  [Role.USER]: [...Permissions.user] as readonly Permission[],
  [Role.ADMIN]: [...Permissions.admin] as readonly Permission[],
};
