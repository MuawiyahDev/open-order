import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type ImageStorage,
  StorageFileNotFoundError,
} from './image-storage.js';

const STORAGE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const DEFAULT_IMAGE_STORAGE_DIR = 'uploads/images';

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  );
}

@Injectable()
export class LocalImageStorage implements ImageStorage, OnModuleInit {
  private readonly baseDir: string;

  constructor(config: ConfigService) {
    this.baseDir = resolve(
      config.get<string>('IMAGE_STORAGE_DIR') ?? DEFAULT_IMAGE_STORAGE_DIR,
    );
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
  }

  async save(key: string, data: Buffer): Promise<void> {
    await writeFile(this.pathFor(key), data);
  }

  async read(key: string): Promise<Buffer> {
    try {
      return await readFile(this.pathFor(key));
    } catch (error) {
      if (isEnoent(error)) {
        throw new StorageFileNotFoundError(key);
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  private pathFor(key: string): string {
    if (!STORAGE_KEY_PATTERN.test(key)) {
      throw new Error('Invalid storage key');
    }

    const path = resolve(this.baseDir, key);

    if (!path.startsWith(`${this.baseDir}${sep}`)) {
      throw new Error('Resolved storage path escapes the storage directory');
    }

    return path;
  }
}
