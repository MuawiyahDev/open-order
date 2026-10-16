import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Image } from '@repo/database';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  IMAGE_STORAGE,
  StorageFileNotFoundError,
} from '../storage/image-storage.js';
import type { CreateImageDto } from './dto/create-image.dto.js';
import type { QueryImagesDto } from './dto/query-images.dto.js';
import { IMAGE_MAX_FILE_SIZE } from './images.constants.js';
import { ImagesService, sanitizeOriginalName } from './images.service.js';

function pngBuffer(width = 16, height = 8): Buffer {
  const buffer = Buffer.alloc(32);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

const MAX_FILE_SIZE = 1024;

const imageFixture: Image = {
  id: '3f1d2c9a-0000-4000-8000-000000000001',
  originalName: 'photo.png',
  storageKey: 'storage-key.png',
  mimeType: 'image/png',
  size: 32,
  width: 16,
  height: 8,
  altText: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('ImagesService', () => {
  let service: ImagesService;

  const prismaMock = {
    client: {
      image: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
    },
  };

  const storageMock = {
    save: vi.fn(),
    read: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ImagesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: IMAGE_STORAGE, useValue: storageMock },
        { provide: IMAGE_MAX_FILE_SIZE, useValue: MAX_FILE_SIZE },
      ],
    }).compile();

    service = moduleRef.get(ImagesService);
  });

  describe('create', () => {
    const emptyDto: CreateImageDto = {};

    it('stores a valid image and returns its metadata', async () => {
      storageMock.save.mockResolvedValue(undefined);
      prismaMock.client.image.create.mockImplementation(async ({ data }) => ({
        ...imageFixture,
        ...data,
        createdAt: imageFixture.createdAt,
        updatedAt: imageFixture.updatedAt,
      }));

      const buffer = pngBuffer();
      const result = await service.create(
        { originalname: 'photo.png', buffer },
        emptyDto,
      );

      expect(storageMock.save).toHaveBeenCalledTimes(1);
      const [key, saved] = storageMock.save.mock.calls[0];
      expect(key).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/,
      );
      expect(saved.equals(buffer)).toBe(true);

      expect(prismaMock.client.image.create).toHaveBeenCalledWith({
        data: {
          originalName: 'photo.png',
          storageKey: key,
          mimeType: 'image/png',
          size: buffer.length,
          width: 16,
          height: 8,
          altText: null,
        },
      });

      expect(result.id).toBe(imageFixture.id);
      expect(result.url).toBe(`/api/images/${imageFixture.id}/file`);
      expect(result).not.toHaveProperty('storageKey');
    });

    it('persists the provided alt text', async () => {
      storageMock.save.mockResolvedValue(undefined);
      prismaMock.client.image.create.mockResolvedValue({
        ...imageFixture,
        altText: 'A red hat',
      });

      const result = await service.create(
        { originalname: 'photo.png', buffer: pngBuffer() },
        { altText: 'A red hat' },
      );

      expect(prismaMock.client.image.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ altText: 'A red hat' }),
      });
      expect(result.altText).toBe('A red hat');
    });

    it('sanitizes path-like original filenames', async () => {
      storageMock.save.mockResolvedValue(undefined);
      prismaMock.client.image.create.mockResolvedValue(imageFixture);

      await service.create(
        { originalname: '../../etc/passwd', buffer: pngBuffer() },
        emptyDto,
      );

      expect(prismaMock.client.image.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ originalName: 'passwd' }),
      });
    });

    it('rejects a request without a file', async () => {
      await expect(service.create(undefined, emptyDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(storageMock.save).not.toHaveBeenCalled();
    });

    it('rejects an empty file', async () => {
      await expect(
        service.create(
          { originalname: 'empty.png', buffer: Buffer.alloc(0) },
          emptyDto,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storageMock.save).not.toHaveBeenCalled();
    });

    it('rejects non-image content regardless of the declared name', async () => {
      await expect(
        service.create(
          { originalname: 'malware.png', buffer: Buffer.from('not an image') },
          emptyDto,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storageMock.save).not.toHaveBeenCalled();
      expect(prismaMock.client.image.create).not.toHaveBeenCalled();
    });

    it('rejects files above the configured size limit', async () => {
      const oversized = Buffer.concat([pngBuffer(), Buffer.alloc(MAX_FILE_SIZE)]);

      await expect(
        service.create({ originalname: 'big.png', buffer: oversized }, emptyDto),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
      expect(storageMock.save).not.toHaveBeenCalled();
    });

    it('does not create a record when storing the file fails', async () => {
      storageMock.save.mockRejectedValue(new Error('disk full'));

      await expect(
        service.create(
          { originalname: 'photo.png', buffer: pngBuffer() },
          emptyDto,
        ),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
      expect(prismaMock.client.image.create).not.toHaveBeenCalled();
    });

    it('removes the stored file when database creation fails', async () => {
      storageMock.save.mockResolvedValue(undefined);
      storageMock.delete.mockResolvedValue(undefined);
      prismaMock.client.image.create.mockRejectedValue(new Error('db down'));

      await expect(
        service.create(
          { originalname: 'photo.png', buffer: pngBuffer() },
          emptyDto,
        ),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      expect(storageMock.delete).toHaveBeenCalledWith(
        storageMock.save.mock.calls[0][0],
      );
    });

    it('still fails the upload when cleanup also fails', async () => {
      storageMock.save.mockResolvedValue(undefined);
      storageMock.delete.mockRejectedValue(new Error('disk gone'));
      prismaMock.client.image.create.mockRejectedValue(new Error('db down'));

      await expect(
        service.create(
          { originalname: 'photo.png', buffer: pngBuffer() },
          emptyDto,
        ),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('findAll', () => {
    it('lists images newest first with pagination metadata', async () => {
      prismaMock.client.image.findMany.mockResolvedValue([imageFixture]);
      prismaMock.client.image.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect(prismaMock.client.image.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
      expect(result.data[0].url).toBe(`/api/images/${imageFixture.id}/file`);
      expect(result.data[0]).not.toHaveProperty('storageKey');
    });

    it('applies page, limit, and case-insensitive filename search', async () => {
      prismaMock.client.image.findMany.mockResolvedValue([]);
      prismaMock.client.image.count.mockResolvedValue(0);

      const query: QueryImagesDto = { page: 3, limit: 5, search: 'Hat' };
      await service.findAll(query);

      expect(prismaMock.client.image.findMany).toHaveBeenCalledWith({
        where: {
          originalName: { contains: 'Hat', mode: 'insensitive' },
        },
        orderBy: { createdAt: 'desc' },
        skip: 10,
        take: 5,
      });
    });
  });

  describe('findOne', () => {
    it('returns image metadata', async () => {
      prismaMock.client.image.findUnique.mockResolvedValue(imageFixture);

      const result = await service.findOne(imageFixture.id);

      expect(result.id).toBe(imageFixture.id);
      expect(result.url).toBe(`/api/images/${imageFixture.id}/file`);
    });

    it('throws NotFound for a missing image', async () => {
      prismaMock.client.image.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne('00000000-0000-4000-8000-000000000000'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getFile', () => {
    it('returns the stored bytes and mime type', async () => {
      const buffer = pngBuffer();
      prismaMock.client.image.findUnique.mockResolvedValue(imageFixture);
      storageMock.read.mockResolvedValue(buffer);

      const result = await service.getFile(imageFixture.id);

      expect(storageMock.read).toHaveBeenCalledWith(imageFixture.storageKey);
      expect(result.mimeType).toBe('image/png');
      expect(result.size).toBe(buffer.length);
      expect(result.data.equals(buffer)).toBe(true);
    });

    it('throws NotFound when the image record does not exist', async () => {
      prismaMock.client.image.findUnique.mockResolvedValue(null);

      await expect(
        service.getFile('00000000-0000-4000-8000-000000000000'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(storageMock.read).not.toHaveBeenCalled();
    });

    it('maps a missing stored file to NotFound', async () => {
      prismaMock.client.image.findUnique.mockResolvedValue(imageFixture);
      storageMock.read.mockRejectedValue(
        new StorageFileNotFoundError(imageFixture.storageKey),
      );

      await expect(service.getFile(imageFixture.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rethrows unexpected storage errors', async () => {
      const diskError = new Error('io error');
      prismaMock.client.image.findUnique.mockResolvedValue(imageFixture);
      storageMock.read.mockRejectedValue(diskError);

      await expect(service.getFile(imageFixture.id)).rejects.toBe(diskError);
    });
  });

  describe('remove', () => {
    it('deletes the file before the database record', async () => {
      prismaMock.client.image.findUnique.mockResolvedValue(imageFixture);
      storageMock.delete.mockResolvedValue(undefined);
      prismaMock.client.image.delete.mockResolvedValue(imageFixture);

      await service.remove(imageFixture.id);

      expect(storageMock.delete).toHaveBeenCalledWith(imageFixture.storageKey);
      expect(prismaMock.client.image.delete).toHaveBeenCalledWith({
        where: { id: imageFixture.id },
      });
      expect(
        storageMock.delete.mock.invocationCallOrder[0],
      ).toBeLessThan(prismaMock.client.image.delete.mock.invocationCallOrder[0]);
    });

    it('throws NotFound and keeps the file when the image does not exist', async () => {
      prismaMock.client.image.findUnique.mockResolvedValue(null);

      await expect(
        service.remove('00000000-0000-4000-8000-000000000000'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(storageMock.delete).not.toHaveBeenCalled();
      expect(prismaMock.client.image.delete).not.toHaveBeenCalled();
    });

    it('does not delete the record when the file cannot be deleted', async () => {
      prismaMock.client.image.findUnique.mockResolvedValue(imageFixture);
      storageMock.delete.mockRejectedValue(new Error('permission denied'));

      await expect(service.remove(imageFixture.id)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      expect(prismaMock.client.image.delete).not.toHaveBeenCalled();
    });

    it('fails when the record cannot be deleted after the file is gone', async () => {
      prismaMock.client.image.findUnique.mockResolvedValue(imageFixture);
      storageMock.delete.mockResolvedValue(undefined);
      prismaMock.client.image.delete.mockRejectedValue(new Error('db down'));

      await expect(service.remove(imageFixture.id)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });
});

describe('sanitizeOriginalName', () => {
  it('strips directory components from POSIX and Windows paths', () => {
    expect(sanitizeOriginalName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeOriginalName('C:\\Users\\me\\photo.jpg')).toBe('photo.jpg');
  });

  it('removes control characters and trims whitespace', () => {
    expect(sanitizeOriginalName('  my\u0000\u001f photo.png  ')).toBe(
      'my photo.png',
    );
  });

  it('falls back to a placeholder for empty or missing names', () => {
    expect(sanitizeOriginalName('')).toBe('image');
    expect(sanitizeOriginalName('   ')).toBe('image');
    expect(sanitizeOriginalName(undefined)).toBe('image');
    expect(sanitizeOriginalName('../')).toBe('image');
  });

  it('truncates very long names', () => {
    expect(sanitizeOriginalName(`${'a'.repeat(400)}.png`)).toHaveLength(255);
  });
});
