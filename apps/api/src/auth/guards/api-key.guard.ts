import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';

export const API_KEY_HEADER = 'x-api-key';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly validKeys: readonly string[];

  constructor(config: ConfigService) {
    this.validKeys = (config.get<string>('API_KEY', '') ?? '')
      .split(',')
      .map((key) => key.trim())
      .filter(Boolean);
  }

  canActivate(context: ExecutionContext): true {
    if (this.validKeys.length === 0) {
      throw new UnauthorizedException('API key authentication is not configured');
    }

    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();

    const provided = request.headers[API_KEY_HEADER];
    const providedKey = Array.isArray(provided) ? provided[0] : provided;

    if (!providedKey) {
      throw new UnauthorizedException('Missing API key');
    }

    const providedHash = this.hash(providedKey);
    const isValid = this.validKeys.some((key) =>
      this.safeEqual(this.hash(key), providedHash),
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }

  private hash(value: string): Buffer {
    return createHash('sha256').update(value).digest();
  }

  private safeEqual(a: Buffer, b: Buffer): boolean {
    return a.length === b.length && timingSafeEqual(a, b);
  }
}