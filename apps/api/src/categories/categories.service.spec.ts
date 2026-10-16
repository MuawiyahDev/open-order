import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, type Category } from '@repo/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { CategoriesService } from './categories.service.js';
import type { CreateCategoryDto } from './dto/create-category.dto.js';
import type { UpdateCategoryDto } from './dto/update-category.dto.js';

const categoryFixture: Category = {
  id: '3f1d2c9a-0000-4000-8000-000000000001',
  name: 'Home Decor',
  slug: 'home-decor',
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

describe('CategoriesService', () => {
  let service: CategoriesService;
  const prismaMock = {
    client: {
      category: {
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
        CategoriesService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = moduleRef.get(CategoriesService);
  });

  describe('create', () => {
    const dto: CreateCategoryDto = { name: 'Home Decor' };

    it('creates a category with a generated slug and active default', async () => {
      prismaMock.client.category.findUnique.mockResolvedValue(null);
      prismaMock.client.category.create.mockResolvedValue(categoryFixture);

      const result = await service.create(dto);

      expect(prismaMock.client.category.create).toHaveBeenCalledWith({
        data: { name: 'Home Decor', slug: 'home-decor', isActive: true },
      });
      expect(result).toEqual(categoryFixture);
    });

    it('uses an explicitly provided slug after normalization', async () => {
      prismaMock.client.category.findUnique.mockResolvedValue(null);
      prismaMock.client.category.create.mockResolvedValue({
        ...categoryFixture,
        slug: 'custom-slug',
      });

      await service.create({ ...dto, slug: ' Custom Slug ' });

      expect(prismaMock.client.category.create).toHaveBeenCalledWith({
        data: { name: 'Home Decor', slug: 'custom-slug', isActive: true },
      });
    });

    it('respects an explicitly provided isActive value', async () => {
      prismaMock.client.category.findUnique.mockResolvedValue(null);
      prismaMock.client.category.create.mockResolvedValue({
        ...categoryFixture,
        isActive: false,
      });

      await service.create({ ...dto, isActive: false });

      expect(prismaMock.client.category.create).toHaveBeenCalledWith({
        data: { name: 'Home Decor', slug: 'home-decor', isActive: false },
      });
    });

    it('rejects a name that produces an empty slug', async () => {
      await expect(service.create({ name: '!!!' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prismaMock.client.category.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate name with a conflict', async () => {
      prismaMock.client.category.findUnique.mockImplementation(
        ({ where }: { where: { name?: string } }) =>
          where.name ? Promise.resolve({ id: categoryFixture.id }) : null,
      );

      await expect(service.create(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prismaMock.client.category.create).not.toHaveBeenCalled();
    });

    it('rejects an explicitly provided duplicate slug with a conflict', async () => {
      prismaMock.client.category.findUnique.mockImplementation(
        ({ where }: { where: { slug?: string } }) =>
          where.slug
            ? Promise.resolve({ id: categoryFixture.id })
            : Promise.resolve(null),
      );

      await expect(
        service.create({ ...dto, slug: 'home-decor' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('appends a numeric suffix when the generated slug is taken', async () => {
      prismaMock.client.category.findUnique.mockImplementation(
        ({ where }: { where: { slug?: string } }) => {
          if (where.slug === 'home-decor') {
            return Promise.resolve({ id: categoryFixture.id });
          }
          return Promise.resolve(null);
        },
      );
      prismaMock.client.category.create.mockResolvedValue({
        ...categoryFixture,
        slug: 'home-decor-2',
      });

      await service.create(dto);

      expect(prismaMock.client.category.create).toHaveBeenCalledWith({
        data: { name: 'Home Decor', slug: 'home-decor-2', isActive: true },
      });
    });

    it('maps a database unique violation to a conflict', async () => {
      prismaMock.client.category.findUnique.mockResolvedValue(null);
      prismaMock.client.category.create.mockRejectedValue(uniqueViolation());

      await expect(service.create(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('does not swallow unexpected database errors', async () => {
      const dbError = new Error('connection lost');
      prismaMock.client.category.findUnique.mockResolvedValue(null);
      prismaMock.client.category.create.mockRejectedValue(dbError);

      await expect(service.create(dto)).rejects.toBe(dbError);
    });
  });

  describe('findAll', () => {
    it('returns paginated results with default page and limit', async () => {
      prismaMock.client.category.findMany.mockResolvedValue([categoryFixture]);
      prismaMock.client.category.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect(prismaMock.client.category.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        data: [categoryFixture],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
    });

    it('applies page, limit, search, and isActive filters', async () => {
      prismaMock.client.category.findMany.mockResolvedValue([]);
      prismaMock.client.category.count.mockResolvedValue(0);

      await service.findAll({
        page: 2,
        limit: 5,
        search: 'home',
        isActive: false,
      });

      expect(prismaMock.client.category.findMany).toHaveBeenCalledWith({
        where: {
          name: { contains: 'home', mode: 'insensitive' },
          isActive: false,
        },
        orderBy: { createdAt: 'desc' },
        skip: 5,
        take: 5,
      });
      expect(prismaMock.client.category.count).toHaveBeenCalledWith({
        where: {
          name: { contains: 'home', mode: 'insensitive' },
          isActive: false,
        },
      });
    });

    it('treats an empty search string as no search filter', async () => {
      prismaMock.client.category.findMany.mockResolvedValue([]);
      prismaMock.client.category.count.mockResolvedValue(0);

      await service.findAll({ search: '' });

      expect(prismaMock.client.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('returns zero total pages when nothing matches', async () => {
      prismaMock.client.category.findMany.mockResolvedValue([]);
      prismaMock.client.category.count.mockResolvedValue(0);

      const result = await service.findAll({});

      expect(result.meta.totalPages).toBe(0);
    });
  });

  describe('findOne', () => {
    it('returns the category when it exists', async () => {
      prismaMock.client.category.findUnique.mockResolvedValue(categoryFixture);

      await expect(service.findOne(categoryFixture.id)).resolves.toEqual(
        categoryFixture,
      );
    });

    it('throws not found for a missing category', async () => {
      prismaMock.client.category.findUnique.mockResolvedValue(null);

      await expect(service.findOne(categoryFixture.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates name, slug, and isActive', async () => {
      prismaMock.client.category.findUnique
        .mockResolvedValueOnce(categoryFixture)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prismaMock.client.category.update.mockResolvedValue({
        ...categoryFixture,
        name: 'Living Room',
        slug: 'living-room',
        isActive: false,
      });

      const dto: UpdateCategoryDto = {
        name: 'Living Room',
        slug: 'living-room',
        isActive: false,
      };

      const result = await service.update(categoryFixture.id, dto);

      expect(prismaMock.client.category.update).toHaveBeenCalledWith({
        where: { id: categoryFixture.id },
        data: { name: 'Living Room', slug: 'living-room', isActive: false },
      });
      expect(result.name).toBe('Living Room');
    });

    it('throws not found for a missing category', async () => {
      prismaMock.client.category.findUnique.mockResolvedValue(null);

      await expect(
        service.update(categoryFixture.id, { name: 'Nope' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the existing category unchanged when no fields are provided', async () => {
      prismaMock.client.category.findUnique.mockResolvedValue(categoryFixture);

      const result = await service.update(categoryFixture.id, {});

      expect(result).toEqual(categoryFixture);
      expect(prismaMock.client.category.update).not.toHaveBeenCalled();
    });

    it('returns the existing category unchanged when the name is unchanged', async () => {
      prismaMock.client.category.findUnique.mockResolvedValue(categoryFixture);

      const result = await service.update(categoryFixture.id, {
        name: categoryFixture.name,
      });

      expect(result).toEqual(categoryFixture);
      expect(prismaMock.client.category.findUnique).toHaveBeenCalledTimes(1);
      expect(prismaMock.client.category.update).not.toHaveBeenCalled();
    });

    it('rejects a duplicate name on update', async () => {
      prismaMock.client.category.findUnique
        .mockResolvedValueOnce(categoryFixture)
        .mockResolvedValueOnce({ id: 'another-id' });

      await expect(
        service.update(categoryFixture.id, { name: 'Taken Name' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a duplicate slug on update', async () => {
      prismaMock.client.category.findUnique
        .mockResolvedValueOnce(categoryFixture)
        .mockResolvedValueOnce({ id: 'another-id' });

      await expect(
        service.update(categoryFixture.id, { slug: 'taken-slug' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a slug that normalizes to an empty string', async () => {
      prismaMock.client.category.findUnique.mockResolvedValue(categoryFixture);

      await expect(
        service.update(categoryFixture.id, { slug: '!!!' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('remove', () => {
    it('deletes an existing category', async () => {
      prismaMock.client.category.findUnique.mockResolvedValue({
        id: categoryFixture.id,
      });
      prismaMock.client.category.delete.mockResolvedValue(categoryFixture);

      await expect(service.remove(categoryFixture.id)).resolves.toBeUndefined();
      expect(prismaMock.client.category.delete).toHaveBeenCalledWith({
        where: { id: categoryFixture.id },
      });
    });

    it('throws not found for a missing category', async () => {
      prismaMock.client.category.findUnique.mockResolvedValue(null);

      await expect(service.remove(categoryFixture.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prismaMock.client.category.delete).not.toHaveBeenCalled();
    });
  });
});
