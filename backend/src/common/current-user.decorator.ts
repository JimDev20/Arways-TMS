import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from './roles.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as JwtPayload;
  },
);
