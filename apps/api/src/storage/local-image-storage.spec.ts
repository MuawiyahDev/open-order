import { access, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { StorageFileNotFoundError } from './image-storage.js';
import { LocalImageStorage } from './local-image-storage.js';

describe('LocalImageStorage', () => {
  let baseDir: string;
  let storage: LocalImageStorage;
  const configMock = { get: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    baseDir = await mkdtemp(join(tmpdir(), 'image-storage-'));
    configMock.get.mockReturnValue(baseDir);
    storage = new LocalImageStorage(
      configMock as unknown as ConfigService,
    );
    await storage.onModuleInit();
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('saves and reads a file by key', async () => {
    const data = Buffer.from('image-bytes');

    await storage.save('a'.repeat(36) + '.png', data);
    const read = await storage.read('a'.repeat(36) + '.png');

    expect(read.equals(data)).toBe(true);
    expect(await readdir(baseDir)).toEqual(['a'.repeat(36) + '.png']);
  });

  it('creates the storage directory on init when missing', async () => {
    const nestedDir = join(baseDir, 'nested', 'uploads');
    configMock.get.mockReturnValue(nestedDir);

    const nestedStorage = new LocalImageStorage(
      configMock as unknown as ConfigService,
    );
    await nestedStorage.onModuleInit();

    await expect(access(nestedDir)).resolves.toBeUndefined();
  });

  it('deletes a stored file and treats repeated deletes as success', async () => {
    const key = 'b'.repeat(36) + '.jpg';

    await storage.save(key, Buffer.from('data'));
    await storage.delete(key);
    await expect(storage.delete(key)).resolves.toBeUndefined();
    expect(await readdir(baseDir)).toEqual([]);
  });

  it('throws StorageFileNotFoundError when reading a missing file', async () => {
    await expect(storage.read('missing.png')).rejects.toBeInstanceOf(
      StorageFileNotFoundError,
    );
  });

  it.each([
    '../escape.png',
    '..',
    'nested/escape.png',
    '/etc/passwd',
    'a\\b.png',
    '',
    '.hidden/escape.png',
  ])('rejects unsafe storage key %j', async (key) => {
    await expect(storage.save(key, Buffer.from('x'))).rejects.toThrow(
      'Invalid storage key',
    );
    await expect(storage.read(key)).rejects.toThrow('Invalid storage key');
    await expect(storage.delete(key)).rejects.toThrow('Invalid storage key');
  });

  it('does not write files outside the storage directory', async () => {
    const escapeTarget = join(baseDir, '..', 'escaped.png');

    await expect(
      storage.save('../escaped.png', Buffer.from('x')),
    ).rejects.toThrow('Invalid storage key');
    await expect(access(escapeTarget)).rejects.toThrow();
  });
});
