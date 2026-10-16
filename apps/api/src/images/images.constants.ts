import { ConfigService } from '@nestjs/config';

export const IMAGE_MAX_FILE_SIZE = Symbol('IMAGE_MAX_FILE_SIZE');

export const DEFAULT_IMAGE_MAX_FILE_SIZE = 5 * 1024 * 1024;

export function resolveImageMaxFileSize(config: ConfigService): number {
  const raw = config.get<string>('IMAGE_MAX_FILE_SIZE');

  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_IMAGE_MAX_FILE_SIZE;
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid IMAGE_MAX_FILE_SIZE value: "${raw}". Expected a positive integer (bytes).`,
    );
  }

  return parsed;
}
