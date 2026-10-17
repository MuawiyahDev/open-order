import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@repo/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProductsService } from './products.service.js';
import type { CreateProductDto } from './dto/create-product.dto.js';
import type { QueryProductsDto } from './dto/query-products.dto.js';
import type { SetProductImagesDto } from './dto/set-product-images.dto.js';

const categoryId = '3f1d2c9a-0000-4000-8000-000000000001';
const brandId = '3f1d2c9a-0000-4000-8000-000000000002';
const imageIdA = '3f1d2c9a-0000-4000-8000-00000000000a';
const imageIdB = '3f1d2c9a-0000-4000-8000-00000000000b';

function productFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: '3f1d2c9a-0000-4000-8000-000000000010',
    name: 'Ceramic Mug',
    slug: 'ceramic-mug',
    description: null,
    shortDescription: null,
    sku: null,
    categoryId,
    category: { id: categoryId, name: 'Kitchen', slug: 'kitchen' },
    brandId: null,
    brand: null,
    unit: null,
    sellingPrice: new Prisma.Decimal('29.99'),
    compareAtPrice: null,
    stockQuantity: 0,
    lowStockThreshold: null,
    weight: null,
    length: null,
    width: null,
    height: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    images: [],
    ...overrides,
  };
}

function uniqueViolation(): Error {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

function foreignKeyViolation(): Error {
  return new Prisma.PrismaClientKnownRequestError('Foreign key failed', {
    code: 'P2003',
    clientVersion: 'test',
  });
}

describe('ProductsService', () => {
  let service: ProductsService;
  const prismaMock = {
    client: {
      $transaction: vi.fn(),
      product: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        fields: { lowStockThreshold: 'Product.lowStockThreshold' },
      },
      productImage: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        deleteMany: vi.fn(),
        createMany: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      },
      category: {
        findUnique: vi.fn(),
      },
      brand: {
        findUnique: vi.fn(),
      },
      image: {
        findMany: vi.fn(),
      },
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    prismaMock.client.$transaction.mockImplementation(
      async (fn: (tx: typeof prismaMock.client) => unknown) =>
        fn(prismaMock.client),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = moduleRef.get(ProductsService);
  });

  describe('create', () => {
    const dto: CreateProductDto = {
      name: 'Ceramic Mug',
      categoryId,
      sellingPrice: 29.99,
    };

    it('creates a product with generated slug and defaults', async () => {
      prismaMock.client.category.findUnique.mockResolvedValue({ id: categoryId });
      prismaMock.client.product.findUnique.mockResolvedValue(null);
      prismaMock.client.product.create.mockResolvedValue(productFixture());

      const result = await service.create(dto);

      expect(prismaMock.client.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Ceramic Mug',
            slug: 'ceramic-mug',
            categoryId,
            sellingPrice: 29.99,
            stockQuantity: 0,
            isActive: true,
            brandId: null,
            sku: null,
          }),
        }),
      );
      expect(result.sellingPrice).toBe('29.99');
      expect(result.slug).toBe('ceramic-mug');
      expect(result.stockQuantity).toBe(0);
      expect(result.isActive).toBe(true);
      expect(result.images).toEqual([]);
    });

    it('creates a product with image associations, first image primary', async () => {
      prismaMock.client.category.findUnique.mockResolvedValue({ id: categoryId });
      prismaMock.client.image.findMany.mockResolvedValue([
        { id: imageIdA },
        { id: imageIdB },
      ]);
      prismaMock.client.product.findUnique.mockResolvedValue(null);
      prismaMock.client.product.create.mockResolvedValue(productFixture());

      await service.create({ ...dto, imageIds: [imageIdA, imageIdB] });

      expect(prismaMock.client.image.findMany).toHaveBeenCalledWith({
        where: { id: { in: [imageIdA, imageIdB] } },
        select: { id: true },
      });
      expect(prismaMock.client.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            images: {
              create: [
                { imageId: imageIdA, sortOrder: 0, isPrimary: true },
                { imageId: imageIdB, sortOrder: 1, isPrimary: false },
              ],
            },
          }),
        }),
      );
    });

    it('uses an explicitly provided slug after normalization', async () => {
      prismaMock.client.category.findUnique.mockResolvedValue({ id: categoryId });
      prismaMock.client.product.findUnique.mockResolvedValue(null);
      prismaMock.client.product.create.mockResolvedValue(
        productFixture({ slug: 'custom-slug' }),
      );

      await service.create({ ...dto, slug: ' Custom Slug ' });

      expect(prismaMock.client.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'custom-slug' }),
        }),
      );
    });

    it('auto-suffixes a generated slug when it is already taken', async () => {
      prismaMock.client.category.findUnique.mockResolvedValue({ id: categoryId });
      prismaMock.client.product.findUnique
        .mockResolvedValueOnce({ id: 'existing' })
        .mockResolvedValueOnce(null);
      prismaMock.client.product.create.mockResolvedValue(
        productFixture({ slug: 'ceramic-mug-2' }),
      );

      await service.create(dto);

      expect(prismaMock.client.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'ceramic-mug-2' }),
        }),
      );
    });

    it('rejects an explicit slug that is already taken', async () => {
      prismaMock.client.category.findUnique.mockResolvedValue({ id: categoryId });
      prismaMock.client.product.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create({ ...dto, slug: 'ceramic-mug' }),
      ).rejects.toThrow(ConflictException);
      expect(prismaMock.client.product.create).not.toHaveBeenCalled();
    });

    it('rejects a name that produces an empty slug', async () => {
      await expect(
        service.create({ ...dto, name: '!!!' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a missing category', async () => {
      prismaMock.client.category.findUnique.mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
      expect(prismaMock.client.product.create).not.toHaveBeenCalled();
    });

    it('rejects a missing brand', async () => {
      prismaMock.client.category.findUnique.mockResolvedValue({ id: categoryId });
      prismaMock.client.brand.findUnique.mockResolvedValue(null);

      await expect(service.create({ ...dto, brandId })).rejects.toThrow(
        NotFoundException,
      );
      expect(prismaMock.client.product.create).not.toHaveBeenCalled();
    });

    it('rejects missing images', async () => {
      prismaMock.client.category.findUnique.mockResolvedValue({ id: categoryId });
      prismaMock.client.image.findMany.mockResolvedValue([{ id: imageIdA }]);

      await expect(
        service.create({ ...dto, imageIds: [imageIdA, imageIdB] }),
      ).rejects.toThrow(NotFoundException);
      expect(prismaMock.client.product.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate SKU before creating', async () => {
      prismaMock.client.category.findUnique.mockResolvedValue({ id: categoryId });
      prismaMock.client.product.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'other' });

      await expect(
        service.create({ ...dto, sku: 'MUG-001' }),
      ).rejects.toThrow(ConflictException);
      expect(prismaMock.client.product.create).not.toHaveBeenCalled();
    });

    it('maps a unique constraint violation to a conflict', async () => {
      prismaMock.client.category.findUnique.mockResolvedValue({ id: categoryId });
      prismaMock.client.product.findUnique.mockResolvedValue(null);
      prismaMock.client.product.create.mockRejectedValue(uniqueViolation());

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('maps a foreign key violation to not found', async () => {
      prismaMock.client.category.findUnique.mockResolvedValue({ id: categoryId });
      prismaMock.client.product.findUnique.mockResolvedValue(null);
      prismaMock.client.product.create.mockRejectedValue(foreignKeyViolation());

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('returns paginated products with metadata', async () => {
      prismaMock.client.product.findMany.mockResolvedValue([
        productFixture(),
      ]);
      prismaMock.client.product.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.sellingPrice).toBe('29.99');
      expect(prismaMock.client.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('searches by name, slug, or SKU', async () => {
      prismaMock.client.product.findMany.mockResolvedValue([]);
      prismaMock.client.product.count.mockResolvedValue(0);

      await service.findAll({ search: 'mug' });

      expect(prismaMock.client.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [
              {
                OR: [
                  { name: { contains: 'mug', mode: 'insensitive' } },
                  { slug: { contains: 'mug', mode: 'insensitive' } },
                  { sku: { contains: 'mug', mode: 'insensitive' } },
                ],
              },
            ],
          }),
        }),
      );
    });

    it('filters by categoryId, brandId, and isActive', async () => {
      prismaMock.client.product.findMany.mockResolvedValue([]);
      prismaMock.client.product.count.mockResolvedValue(0);

      await service.findAll({ categoryId, brandId, isActive: true });

      expect(prismaMock.client.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            categoryId,
            brandId,
            isActive: true,
          }),
        }),
      );
    });

    it('filters low-stock products using a field reference', async () => {
      prismaMock.client.product.findMany.mockResolvedValue([]);
      prismaMock.client.product.count.mockResolvedValue(0);

      await service.findAll({ lowStock: true });

      expect(prismaMock.client.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [
              {
                lowStockThreshold: { not: null },
                stockQuantity: {
                  lte: prismaMock.client.product.fields.lowStockThreshold,
                },
              },
            ],
          }),
        }),
      );
    });

    it('filters by selling price range', async () => {
      prismaMock.client.product.findMany.mockResolvedValue([]);
      prismaMock.client.product.count.mockResolvedValue(0);

      await service.findAll({ minPrice: 10, maxPrice: 50 });

      expect(prismaMock.client.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sellingPrice: { gte: 10, lte: 50 },
          }),
        }),
      );
    });

    it('rejects minPrice greater than maxPrice', async () => {
      await expect(
        service.findAll({ minPrice: 50, maxPrice: 10 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('sorts by selling price ascending when requested', async () => {
      prismaMock.client.product.findMany.mockResolvedValue([]);
      prismaMock.client.product.count.mockResolvedValue(0);

      const query: QueryProductsDto = {
        sortBy: 'sellingPrice',
        sortOrder: 'asc',
      };
      await service.findAll(query);

      expect(prismaMock.client.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { sellingPrice: 'asc' },
        }),
      );
    });

    it('defaults to sorting by creation date descending', async () => {
      prismaMock.client.product.findMany.mockResolvedValue([]);
      prismaMock.client.product.count.mockResolvedValue(0);

      await service.findAll({});

      expect(prismaMock.client.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns a product by id', async () => {
      prismaMock.client.product.findUnique.mockResolvedValue(productFixture());

      const result = await service.findOne('3f1d2c9a-0000-4000-8000-000000000010');

      expect(result.id).toBe('3f1d2c9a-0000-4000-8000-000000000010');
      expect(result.sellingPrice).toBe('29.99');
    });

    it('throws NotFound for a missing product', async () => {
      prismaMock.client.product.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne('3f1d2c9a-0000-4000-8000-000000000010'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const existing = productFixture({
      sku: 'MUG-001',
      brandId,
      brand: { id: brandId, name: 'Acme', slug: 'acme' },
    });

    it('applies only supplied fields', async () => {
      prismaMock.client.product.findUnique.mockResolvedValue(existing);
      prismaMock.client.product.update.mockResolvedValue(
        productFixture({ name: 'Updated Name', sku: 'MUG-001' }),
      );

      await service.update(existing.id as string, { name: 'Updated Name' });

      expect(prismaMock.client.product.update).toHaveBeenCalledWith({
        where: { id: existing.id },
        data: { name: 'Updated Name' },
        include: expect.any(Object),
      });
    });

    it('returns the existing product when nothing is supplied', async () => {
      prismaMock.client.product.findUnique.mockResolvedValue(existing);

      const result = await service.update(existing.id as string, {});

      expect(result.name).toBe('Ceramic Mug');
      expect(prismaMock.client.product.update).not.toHaveBeenCalled();
    });

    it('clears brand when brandId is explicitly null', async () => {
      prismaMock.client.product.findUnique.mockResolvedValue(existing);
      prismaMock.client.product.update.mockResolvedValue(productFixture());

      await service.update(existing.id as string, { brandId: null });

      expect(prismaMock.client.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { brand: { disconnect: true } },
        }),
      );
    });

    it('clears SKU when sku is explicitly null', async () => {
      prismaMock.client.product.findUnique.mockResolvedValue(existing);
      prismaMock.client.product.update.mockResolvedValue(productFixture());

      await service.update(existing.id as string, { sku: null });

      expect(prismaMock.client.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { sku: null },
        }),
      );
    });

    it('validates a changed category reference', async () => {
      const newCategoryId = '3f1d2c9a-0000-4000-8000-000000000099';
      prismaMock.client.product.findUnique.mockResolvedValue(existing);
      prismaMock.client.category.findUnique.mockResolvedValue(null);

      await expect(
        service.update(existing.id as string, { categoryId: newCategoryId }),
      ).rejects.toThrow(NotFoundException);
      expect(prismaMock.client.product.update).not.toHaveBeenCalled();
    });

    it('validates a changed brand reference', async () => {
      const newBrandId = '3f1d2c9a-0000-4000-8000-000000000098';
      prismaMock.client.product.findUnique.mockResolvedValue(existing);
      prismaMock.client.brand.findUnique.mockResolvedValue(null);

      await expect(
        service.update(existing.id as string, { brandId: newBrandId }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a slug already used by another product', async () => {
      prismaMock.client.product.findUnique
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({ id: 'other' });

      await expect(
        service.update(existing.id as string, { slug: 'taken-slug' }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects an SKU already used by another product', async () => {
      prismaMock.client.product.findUnique
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({ id: 'other' });

      await expect(
        service.update(existing.id as string, { sku: 'TAKEN-1' }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFound for a missing product', async () => {
      prismaMock.client.product.findUnique.mockResolvedValue(null);

      await expect(
        service.update('3f1d2c9a-0000-4000-8000-000000000010', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('maps a unique constraint violation to a conflict', async () => {
      prismaMock.client.product.findUnique.mockResolvedValue(existing);
      prismaMock.client.product.update.mockRejectedValue(uniqueViolation());

      await expect(
        service.update(existing.id as string, { name: 'Updated' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('deletes a product', async () => {
      prismaMock.client.product.findUnique.mockResolvedValue({ id: 'id' });
      prismaMock.client.product.delete.mockResolvedValue({});

      await service.remove('id');

      expect(prismaMock.client.product.delete).toHaveBeenCalledWith({
        where: { id: 'id' },
      });
    });

    it('throws NotFound for a missing product', async () => {
      prismaMock.client.product.findUnique.mockResolvedValue(null);

      await expect(service.remove('id')).rejects.toThrow(NotFoundException);
    });

    it('maps a referenced-record violation to a conflict', async () => {
      prismaMock.client.product.findUnique.mockResolvedValue({ id: 'id' });
      prismaMock.client.product.delete.mockRejectedValue(foreignKeyViolation());

      await expect(service.remove('id')).rejects.toThrow(ConflictException);
    });
  });

  describe('replaceImages', () => {
    it('replaces associations with the supplied ordered list', async () => {
      prismaMock.client.product.findUnique
        .mockResolvedValueOnce({ id: 'id' })
        .mockResolvedValueOnce(productFixture());
      prismaMock.client.image.findMany.mockResolvedValue([
        { id: imageIdA },
        { id: imageIdB },
      ]);

      const dto: SetProductImagesDto = { imageIds: [imageIdB, imageIdA] };
      await service.replaceImages('id', dto);

      expect(prismaMock.client.productImage.deleteMany).toHaveBeenCalledWith({
        where: { productId: 'id' },
      });
      expect(prismaMock.client.productImage.createMany).toHaveBeenCalledWith({
        data: [
          { productId: 'id', imageId: imageIdB, sortOrder: 0, isPrimary: true },
          { productId: 'id', imageId: imageIdA, sortOrder: 1, isPrimary: false },
        ],
      });
    });

    it('clears all images when an empty list is supplied', async () => {
      prismaMock.client.product.findUnique
        .mockResolvedValueOnce({ id: 'id' })
        .mockResolvedValueOnce(productFixture());

      await service.replaceImages('id', { imageIds: [] });

      expect(prismaMock.client.productImage.deleteMany).toHaveBeenCalled();
      expect(prismaMock.client.productImage.createMany).not.toHaveBeenCalled();
      expect(prismaMock.client.image.findMany).not.toHaveBeenCalled();
    });

    it('throws NotFound for a missing product', async () => {
      prismaMock.client.product.findUnique.mockResolvedValue(null);

      await expect(
        service.replaceImages('id', { imageIds: [] }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound when an image does not exist', async () => {
      prismaMock.client.product.findUnique.mockResolvedValue({ id: 'id' });
      prismaMock.client.image.findMany.mockResolvedValue([{ id: imageIdA }]);

      await expect(
        service.replaceImages('id', { imageIds: [imageIdA, imageIdB] }),
      ).rejects.toThrow(NotFoundException);
      expect(prismaMock.client.productImage.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('removeImage', () => {
    it('removes an image association', async () => {
      prismaMock.client.product.findUnique.mockResolvedValue({ id: 'id' });
      prismaMock.client.productImage.findUnique.mockResolvedValue({
        id: 'assoc-id',
        isPrimary: false,
      });

      await service.removeImage('id', imageIdA);

      expect(prismaMock.client.productImage.delete).toHaveBeenCalledWith({
        where: { id: 'assoc-id' },
      });
      expect(prismaMock.client.productImage.update).not.toHaveBeenCalled();
    });

    it('promotes the next image when the primary is removed', async () => {
      prismaMock.client.product.findUnique.mockResolvedValue({ id: 'id' });
      prismaMock.client.productImage.findUnique.mockResolvedValue({
        id: 'assoc-id',
        isPrimary: true,
      });
      prismaMock.client.productImage.findFirst.mockResolvedValue({
        id: 'next-assoc-id',
      });

      await service.removeImage('id', imageIdA);

      expect(prismaMock.client.productImage.update).toHaveBeenCalledWith({
        where: { id: 'next-assoc-id' },
        data: { isPrimary: true },
      });
    });

    it('throws NotFound for a missing product', async () => {
      prismaMock.client.product.findUnique.mockResolvedValue(null);

      await expect(service.removeImage('id', imageIdA)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFound when the image is not associated', async () => {
      prismaMock.client.product.findUnique.mockResolvedValue({ id: 'id' });
      prismaMock.client.productImage.findUnique.mockResolvedValue(null);

      await expect(service.removeImage('id', imageIdA)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
