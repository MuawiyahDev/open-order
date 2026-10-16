import { Role } from '@repo/database';

export const Permissions = {
  user: ['user:read', 'user:update'],
  admin: ['user:read', 'user:update', 'user:delete'],
  category: [
    'category:read',
    'category:create',
    'category:update',
    'category:delete',
  ],
  brand: ['brand:read', 'brand:create', 'brand:update', 'brand:delete'],
  image: ['image:read', 'image:create', 'image:delete'],
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions][number];

type RolePermissions = {
  [K in Role]: readonly Permission[];
};

export const ROLE_PERMISSIONS: RolePermissions = {
  [Role.USER]: [
    ...Permissions.user,
    ...Permissions.category,
    ...Permissions.brand,
    ...Permissions.image,
  ] as readonly Permission[],
  [Role.ADMIN]: [
    ...Permissions.admin,
    ...Permissions.category,
    ...Permissions.brand,
    ...Permissions.image,
  ] as readonly Permission[],
};
