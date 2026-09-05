import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { User } from '@repo/database';

export const CurrentUser = createParamDecorator(
  (data: keyof User | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user: User }>();
    const user = request.user;
    return data ? user[data] : user;
  },
);
