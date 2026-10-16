import type { ConfigService } from '@nestjs/config';
import {
  DEFAULT_IMAGE_MAX_FILE_SIZE,
  resolveImageMaxFileSize,
} from './images.constants.js';

describe('resolveImageMaxFileSize', () => {
  const configMock = { get: vi.fn() };

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to the default when unset or blank', () => {
    configMock.get.mockReturnValue(undefined);
    expect(resolveImageMaxFileSize(configMock as unknown as ConfigService)).toBe(
      DEFAULT_IMAGE_MAX_FILE_SIZE,
    );

    configMock.get.mockReturnValue('   ');
    expect(resolveImageMaxFileSize(configMock as unknown as ConfigService)).toBe(
      DEFAULT_IMAGE_MAX_FILE_SIZE,
    );
  });

  it('parses a positive integer', () => {
    configMock.get.mockReturnValue('1048576');
    expect(resolveImageMaxFileSize(configMock as unknown as ConfigService)).toBe(
      1048576,
    );
  });

  it.each(['-1', '0', 'abc', '1.5', 'NaN'])(
    'throws on invalid value %j',
    (value) => {
      configMock.get.mockReturnValue(value);
      expect(() =>
        resolveImageMaxFileSize(configMock as unknown as ConfigService),
      ).toThrow(/Invalid IMAGE_MAX_FILE_SIZE/);
    },
  );
});
