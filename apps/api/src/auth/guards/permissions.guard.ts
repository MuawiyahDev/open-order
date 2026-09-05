import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { User } from '@repo/database';
import { ROLE_PERMISSIONS } from '../constants/permissions.constants.js';
import type { Permission } from '../constants/permissions.constants.js';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user: User }>();
    const userPermissions = ROLE_PERMISSIONS[user.role];

    return requiredPermissions.every((permission) =>
      userPermissions.includes(permission),
    );
  }
}
