import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../guards/api-key.guard.js';
import { Public } from './public.decorator.js';

export function ApiKeyAuth() {
  return applyDecorators(Public(), UseGuards(ApiKeyGuard));
}