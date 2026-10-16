import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, type Brand } from '@repo/database';
import { BrandsService } from './brands.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateBrandDto } from './dto/create-brand.dto.js';
import type { UpdateBrandDto } from './dto/update-brand.dto.js';

const brandFixture: Brand = {
  id: '3f1d2c9a-0000-4000-8000-000000000001',
  name: 'Acme',
  slug: 'acme',
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function uniqueViolation(): Error {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('BrandsService', () => {
  let service: BrandsService;
  const prismaMock = {
    client: {
      brand: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        BrandsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = moduleRef.get(BrandsService);
  });

  describe('create', () => {
    const dto: CreateBrandDto = { name: 'Acme' };

    it('creates a brand with a generated slug and active default', async () => {
      prismaMock.client.brand.findUnique.mockResolvedValue(null);
      prismaMock.client.brand.create.mockResolvedValue(brandFixture);

      const result = await service.create(dto);

      expect(prismaMock.client.brand.create).toHaveBeenCalledWith({
        data: {
          name: 'Acme',
          slug: 'acme',
          isActive: true,
        },
      });
      expect(result).toEqual(brandFixture);
    });

    it('uses an explicitly provided slug after normalization', async () => {
      prismaMock.client.brand.findUnique.mockResolvedValue(null);
      prismaMock.client.brand.create.mockResolvedValue({
        ...brandFixture,
        slug: 'custom-slug',
      });

      await service.create({ ...dto, slug: ' Custom Slug ' });

      expect(prismaMock.client.brand.create).toHaveBeenCalledWith({
        data: {
          name: 'Acme',
          slug: 'custom-slug',
          isActive: true,
        },
      });
    });

    it('respects an explicitly provided isActive value', async () => {
      prismaMock.client.brand.findUnique.mockResolvedValue(null);
      prismaMock.client.brand.create.mockResolvedValue({
        ...brandFixture,
        isActive: false,
      });

      await service.create({ ...dto, isActive: false });

      expect(prismaMock.client.brand.create).toHaveBeenCalledWith({
        data: {
          name: 'Acme',
          slug: 'acme',
          isActive: false,
        },
      });
    });

    it('rejects a name that produces an empty slug', async () => {
      await expect(service.create({ name: '!!!' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prismaMock.client.brand.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate name with a conflict', async () => {
      prismaMock.client.brand.findUnique.mockImplementation(
        ({ where }: { where: { name?: string } }) =>
          where.name ? Promise.resolve({ id: brandFixture.id }) : null,
      );

      await expect(service.create(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prismaMock.client.brand.create).not.toHaveBeenCalled();
    });

    it('rejects an explicitly provided duplicate slug with a conflict', async () => {
      prismaMock.client.brand.findUnique.mockImplementation(
        ({ where }: { where: { slug?: string } }) =>
          where.slug
            ? Promise.resolve({ id: brandFixture.id })
            : Promise.resolve(null),
      );

      await expect(
        service.create({ ...dto, slug: 'acme' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('appends a numeric suffix when the generated slug is taken', async () => {
      prismaMock.client.brand.findUnique.mockImplementation(
        ({ where }: { where: { slug?: string } }) => {
          if (where.slug === 'acme') {
            return Promise.resolve({ id: brandFixture.id });
          }
          return Promise.resolve(null);
        },
      );
      prismaMock.client.brand.create.mockResolvedValue({
        ...brandFixture,
        slug: 'acme-2',
      });

      await service.create(dto);

      expect(prismaMock.client.brand.create).toHaveBeenCalledWith({
        data: {
          name: 'Acme',
          slug: 'acme-2',
          isActive: true,
        },
      });
    });

    it('maps a database unique violation to a conflict', async () => {
      prismaMock.client.brand.findUnique.mockResolvedValue(null);
      prismaMock.client.brand.create.mockRejectedValue(uniqueViolation());

      await expect(service.create(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('does not swallow unexpected database errors', async () => {
      const dbError = new Error('connection lost');
      prismaMock.client.brand.findUnique.mockResolvedValue(null);
      prismaMock.client.brand.create.mockRejectedValue(dbError);

      await expect(service.create(dto)).rejects.toBe(dbError);
    });
  });

  describe('findAll', () => {
    it('returns paginated results with default page and limit', async () => {
      prismaMock.client.brand.findMany.mockResolvedValue([brandFixture]);
      prismaMock.client.brand.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect(prismaMock.client.brand.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        data: [brandFixture],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
    });

    it('applies page, limit, search, and isActive filters', async () => {
      prismaMock.client.brand.findMany.mockResolvedValue([]);
      prismaMock.client.brand.count.mockResolvedValue(0);

      await service.findAll({
        page: 2,
        limit: 5,
        search: 'acme',
        isActive: false,
      });

      expect(prismaMock.client.brand.findMany).toHaveBeenCalledWith({
        where: {
          name: { contains: 'acme', mode: 'insensitive' },
          isActive: false,
        },
        orderBy: { createdAt: 'desc' },
        skip: 5,
        take: 5,
      });
      expect(prismaMock.client.brand.count).toHaveBeenCalledWith({
        where: {
          name: { contains: 'acme', mode: 'insensitive' },
          isActive: false,
        },
      });
    });

    it('treats an empty search string as no search filter', async () => {
      prismaMock.client.brand.findMany.mockResolvedValue([]);
      prismaMock.client.brand.count.mockResolvedValue(0);

      await service.findAll({ search: '' });

      expect(prismaMock.client.brand.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('returns zero total pages when nothing matches', async () => {
      prismaMock.client.brand.findMany.mockResolvedValue([]);
      prismaMock.client.brand.count.mockResolvedValue(0);

      const result = await service.findAll({});

      expect(result.meta.totalPages).toBe(0);
    });
  });

  describe('findOne', () => {
    it('returns the brand when it exists', async () => {
      prismaMock.client.brand.findUnique.mockResolvedValue(brandFixture);

      await expect(service.findOne(brandFixture.id)).resolves.toEqual(
        brandFixture,
      );
    });

    it('throws not found for a missing brand', async () => {
      prismaMock.client.brand.findUnique.mockResolvedValue(null);

      await expect(service.findOne(brandFixture.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates name, slug, and isActive', async () => {
      prismaMock.client.brand.findUnique
        .mockResolvedValueOnce(brandFixture)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prismaMock.client.brand.update.mockResolvedValue({
        ...brandFixture,
        name: 'Acme Co',
        slug: 'acme-co',
        isActive: false,
      });

      const dto: UpdateBrandDto = {
        name: 'Acme Co',
        slug: 'acme-co',
        isActive: false,
      };

      const result = await service.update(brandFixture.id, dto);

      expect(prismaMock.client.brand.update).toHaveBeenCalledWith({
        where: { id: brandFixture.id },
        data: {
          name: 'Acme Co',
          slug: 'acme-co',
          isActive: false,
        },
      });
      expect(result.name).toBe('Acme Co');
    });

    it('throws not found for a missing brand', async () => {
      prismaMock.client.brand.findUnique.mockResolvedValue(null);

      await expect(
        service.update(brandFixture.id, { name: 'Nope' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the existing brand unchanged when no fields are provided', async () => {
      prismaMock.client.brand.findUnique.mockResolvedValue(brandFixture);

      const result = await service.update(brandFixture.id, {});

      expect(result).toEqual(brandFixture);
      expect(prismaMock.client.brand.update).not.toHaveBeenCalled();
    });

    it('returns the existing brand unchanged when the name is unchanged', async () => {
      prismaMock.client.brand.findUnique.mockResolvedValue(brandFixture);

      const result = await service.update(brandFixture.id, {
        name: brandFixture.name,
      });

      expect(result).toEqual(brandFixture);
      expect(prismaMock.client.brand.findUnique).toHaveBeenCalledTimes(1);
      expect(prismaMock.client.brand.update).not.toHaveBeenCalled();
    });

    it('rejects a duplicate name on update', async () => {
      prismaMock.client.brand.findUnique
        .mockResolvedValueOnce(brandFixture)
        .mockResolvedValueOnce({ id: 'another-id' });

      await expect(
        service.update(brandFixture.id, { name: 'Taken Name' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a duplicate slug on update', async () => {
      prismaMock.client.brand.findUnique
        .mockResolvedValueOnce(brandFixture)
        .mockResolvedValueOnce({ id: 'another-id' });

      await expect(
        service.update(brandFixture.id, { slug: 'taken-slug' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a slug that normalizes to an empty string', async () => {
      prismaMock.client.brand.findUnique.mockResolvedValue(brandFixture);

      await expect(
        service.update(brandFixture.id, { slug: '!!!' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('remove', () => {
    it('deletes an existing brand', async () => {
      prismaMock.client.brand.findUnique.mockResolvedValue({
        id: brandFixture.id,
      });
      prismaMock.client.brand.delete.mockResolvedValue(brandFixture);

      await expect(service.remove(brandFixture.id)).resolves.toBeUndefined();
      expect(prismaMock.client.brand.delete).toHaveBeenCalledWith({
        where: { id: brandFixture.id },
      });
    });

    it('throws not found for a missing brand', async () => {
      prismaMock.client.brand.findUnique.mockResolvedValue(null);

      await expect(service.remove(brandFixture.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prismaMock.client.brand.delete).not.toHaveBeenCalled();
    });

    it('maps a foreign key violation to a conflict', async () => {
      prismaMock.client.brand.findUnique.mockResolvedValue({
        id: brandFixture.id,
      });
      prismaMock.client.brand.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'Foreign key constraint failed',
          {
            code: 'P2003',
            clientVersion: 'test',
          },
        ),
      );

      await expect(service.remove(brandFixture.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('does not swallow unexpected database errors', async () => {
      const dbError = new Error('connection lost');
      prismaMock.client.brand.findUnique.mockResolvedValue({
        id: brandFixture.id,
      });
      prismaMock.client.brand.delete.mockRejectedValue(dbError);

      await expect(service.remove(brandFixture.id)).rejects.toBe(dbError);
    });
  });
});
