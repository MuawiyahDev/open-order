import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ApiKeyGuard } from './api-key.guard.js';

const VALID_KEY = 'secret-api-key';

function createContext(headers: Record<string, string | undefined> = {}) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
    getHandler: () => null,
    getClass: () => null,
  } as never;
}

async function createGuard(apiKeyConfig: string): Promise<ApiKeyGuard> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      ApiKeyGuard,
      {
        provide: ConfigService,
        useValue: {
          get: (key: string, fallback?: unknown) =>
            key === 'API_KEY' ? apiKeyConfig : fallback,
        },
      },
    ],
  }).compile();

  return moduleRef.get(ApiKeyGuard);
}

describe('ApiKeyGuard', () => {
  it('allows access with a valid API key', async () => {
    const guard = await createGuard(VALID_KEY);
    const context = createContext({ 'x-api-key': VALID_KEY });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when multiple keys are configured', async () => {
    const guard = await createGuard(`key-one, ${VALID_KEY}, key-three`);
    const context = createContext({ 'x-api-key': VALID_KEY });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects when no API key header is provided', async () => {
    const guard = await createGuard(VALID_KEY);
    const context = createContext();

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects an invalid API key', async () => {
    const guard = await createGuard(VALID_KEY);
    const context = createContext({ 'x-api-key': 'wrong-key' });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects when API key auth is not configured', async () => {
    const guard = await createGuard('');
    const context = createContext({ 'x-api-key': 'anything' });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});