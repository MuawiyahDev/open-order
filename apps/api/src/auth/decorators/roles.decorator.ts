import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { Role } from '@repo/database';
import { RolesGuard } from '../guards/roles.guard.js';

export const ROLES_KEY = 'roles';

export function Roles(...roles: Role[]) {
  return applyDecorators(SetMetadata(ROLES_KEY, roles), UseGuards(RolesGuard));
}
