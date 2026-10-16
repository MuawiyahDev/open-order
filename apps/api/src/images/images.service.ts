import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { type Image, Prisma } from '@repo/database';
import {
  detectImageMimeType,
  readImageDimensions,
  type SupportedImageMimeType,
} from '../common/utils/image-signature.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  IMAGE_STORAGE,
  type ImageStorage,
  StorageFileNotFoundError,
} from '../storage/image-storage.js';
import type { CreateImageDto } from './dto/create-image.dto.js';
import type { QueryImagesDto } from './dto/query-images.dto.js';
import { IMAGE_MAX_FILE_SIZE } from './images.constants.js';

export const DEFAULT_PAGE_SIZE = 20;

const IMAGE_API_ROUTE = '/api/images';

const MAX_STORED_ORIGINAL_NAME_LENGTH = 255;

const MIME_TYPE_EXTENSIONS: Record<SupportedImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export interface UploadedImageFile {
  originalname: string;
  buffer: Buffer;
}

export interface ImageResponse {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  altText: string | null;
  url: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedImages {
  data: ImageResponse[];
  meta: PaginationMeta;
}

export interface StoredImageFile {
  mimeType: string;
  data: Buffer;
  size: number;
}

export function sanitizeOriginalName(originalName: string | undefined): string {
  const baseName = (originalName ?? '').split(/[\\/]/).pop() ?? '';
  const sanitized = baseName
    // oxlint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();

  if (!sanitized) {
    return 'image';
  }

  return sanitized.slice(0, MAX_STORED_ORIGINAL_NAME_LENGTH);
}

@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(IMAGE_STORAGE) private readonly storage: ImageStorage,
    @Inject(IMAGE_MAX_FILE_SIZE) private readonly maxFileSize: number,
  ) {}

  async create(
    file: UploadedImageFile | undefined,
    dto: CreateImageDto,
  ): Promise<ImageResponse> {
    const buffer = file?.buffer;

    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Image file is required');
    }

    if (buffer.length > this.maxFileSize) {
      throw new PayloadTooLargeException(
        `Image file exceeds the maximum allowed size of ${this.maxFileSize} bytes`,
      );
    }

    const mimeType = detectImageMimeType(buffer);

    if (!mimeType) {
      throw new BadRequestException(
        'Unsupported image format. Allowed formats: JPEG, PNG, WebP, GIF',
      );
    }

    const dimensions = readImageDimensions(buffer, mimeType);
    const storageKey = `${randomUUID()}.${MIME_TYPE_EXTENSIONS[mimeType]}`;
    const originalName = sanitizeOriginalName(file?.originalname);

    try {
      await this.storage.save(storageKey, buffer);
    } catch (error) {
      this.logger.error(
        `Failed to store image file "${storageKey}"`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        'Failed to store the uploaded image',
      );
    }

    try {
      const image = await this.prisma.client.image.create({
        data: {
          originalName,
          storageKey,
          mimeType,
          size: buffer.length,
          width: dimensions?.width ?? null,
          height: dimensions?.height ?? null,
          altText: dto.altText ?? null,
        },
      });

      return this.toResponse(image);
    } catch (error) {
      await this.cleanupStoredFile(storageKey);
      this.logger.error(
        `Failed to save image metadata for "${storageKey}"`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        'Failed to save the uploaded image',
      );
    }
  }

  async findAll(query: QueryImagesDto): Promise<PaginatedImages> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const search = query.search || undefined;

    const where: Prisma.ImageWhereInput = search
      ? {
          originalName: {
            contains: search,
            mode: 'insensitive',
          },
        }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.client.image.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.image.count({ where }),
    ]);

    return {
      data: data.map((image) => this.toResponse(image)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<ImageResponse> {
    const image = await this.prisma.client.image.findUnique({
      where: { id },
    });

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    return this.toResponse(image);
  }

  async getFile(id: string): Promise<StoredImageFile> {
    const image = await this.prisma.client.image.findUnique({
      where: { id },
    });

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    try {
      const data = await this.storage.read(image.storageKey);
      return { mimeType: image.mimeType, data, size: data.length };
    } catch (error) {
      if (error instanceof StorageFileNotFoundError) {
        throw new NotFoundException('Image file not found');
      }

      this.logger.error(
        `Failed to read image file for "${id}"`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const image = await this.prisma.client.image.findUnique({
      where: { id },
      select: { id: true, storageKey: true },
    });

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    // Delete the file first. Storage deletes are idempotent, so if the
    // database delete fails afterwards the record remains and a retry
    // converges instead of leaving an orphaned file behind.
    try {
      await this.storage.delete(image.storageKey);
    } catch (error) {
      this.logger.error(
        `Failed to delete image file "${image.storageKey}"`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException('Failed to delete the image');
    }

    try {
      await this.prisma.client.image.delete({ where: { id } });
    } catch (error) {
      this.logger.error(
        `Failed to delete image record "${id}" after deleting its file`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException('Failed to delete the image');
    }
  }

  private toResponse(image: Image): ImageResponse {
    return {
      id: image.id,
      originalName: image.originalName,
      mimeType: image.mimeType,
      size: image.size,
      width: image.width,
      height: image.height,
      altText: image.altText,
      url: `${IMAGE_API_ROUTE}/${image.id}/file`,
      createdAt: image.createdAt,
      updatedAt: image.updatedAt,
    };
  }

  private async cleanupStoredFile(storageKey: string): Promise<void> {
    try {
      await this.storage.delete(storageKey);
    } catch (error) {
      this.logger.warn(
        `Failed to clean up stored file "${storageKey}" after a database error`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
