export const IMAGE_STORAGE = Symbol('IMAGE_STORAGE');

export interface ImageStorage {
  save(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export class StorageFileNotFoundError extends Error {
  constructor(key: string) {
    super(`Stored file not found: ${key}`);
    this.name = 'StorageFileNotFoundError';
  }
}
