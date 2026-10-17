import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AppModule } from './../src/app.module.js';

const TEST_API_KEY = 'e2e-test-api-key';

function pngBuffer(width = 16, height = 8): Buffer {
  const buffer = Buffer.alloc(32);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

describe('Products (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;
  let prisma: PrismaService;
  let storageDir: string;
  let categoryId: string;
  let brandId: string;
  let imageIdA: string;
  let imageIdB: string;

  const uniqueSuffix = Date.now().toString();

  function auth() {
    return { Authorization: `Bearer ${accessToken}` };
  }

  function createProduct(body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/products')
      .set('x-api-key', TEST_API_KEY)
      .set(auth())
      .send(body);
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'e2e-test-secret';
    process.env.API_KEY = TEST_API_KEY;
    storageDir = await mkdtemp(join(tmpdir(), 'products-e2e-'));
    process.env.IMAGE_STORAGE_DIR = storageDir;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    const email = `products-e2e-${uniqueSuffix}@example.com`;
    const password = 'strong-password-123';

    await request(app.getHttpServer())
      .post('/auth/register')
      .set('x-api-key', TEST_API_KEY)
      .send({ email, password })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-api-key', TEST_API_KEY)
      .send({ email, password })
      .expect(200);

    accessToken = login.body.accessToken;

    const category = await request(app.getHttpServer())
      .post('/categories')
      .set('x-api-key', TEST_API_KEY)
      .set(auth())
      .send({ name: `E2E Products ${uniqueSuffix}` })
      .expect(201);
    categoryId = category.body.id;

    const brand = await request(app.getHttpServer())
      .post('/brands')
      .set('x-api-key', TEST_API_KEY)
      .set(auth())
      .send({ name: `E2E Products ${uniqueSuffix}` })
      .expect(201);
    brandId = brand.body.id;

    const imageA = await request(app.getHttpServer())
      .post('/images')
      .set('x-api-key', TEST_API_KEY)
      .set(auth())
      .attach('file', pngBuffer(), `product-a-${uniqueSuffix}.png`)
      .expect(201);
    imageIdA = imageA.body.id;

    const imageB = await request(app.getHttpServer())
      .post('/images')
      .set('x-api-key', TEST_API_KEY)
      .set(auth())
      .attach('file', pngBuffer(), `product-b-${uniqueSuffix}.png`)
      .expect(201);
    imageIdB = imageB.body.id;
  });

  afterAll(async () => {
    await prisma.client.product.deleteMany({
      where: { name: { startsWith: `E2E Product ${uniqueSuffix}` } },
    });
    await prisma.client.image.deleteMany({
      where: { originalName: { contains: uniqueSuffix } },
    });
    await prisma.client.brand.deleteMany({
      where: { name: { contains: uniqueSuffix } },
    });
    await prisma.client.category.deleteMany({
      where: { name: { contains: uniqueSuffix } },
    });
    await app.close();
    await rm(storageDir, { recursive: true, force: true });
  });

  describe('authentication', () => {
    it('rejects requests without an API key', async () => {
      await request(app.getHttpServer()).get('/products').expect(401);
    });

    it('rejects requests without a JWT', async () => {
      await request(app.getHttpServer())
        .get('/products')
        .set('x-api-key', TEST_API_KEY)
        .expect(401);
    });

    it('rejects requests with an invalid JWT', async () => {
      await request(app.getHttpServer())
        .get('/products')
        .set('x-api-key', TEST_API_KEY)
        .set('Authorization', 'Bearer garbage-token')
        .expect(401);
    });
  });

  describe('POST /products', () => {
    it('creates a product with a generated slug and defaults', async () => {
      const res = await createProduct({
        name: `E2E Product ${uniqueSuffix} Basic`,
        categoryId,
        sellingPrice: 29.99,
      }).expect(201);

      expect(res.body.slug).toBe(
        `e2e-product-${uniqueSuffix}-basic`.toLowerCase(),
      );
      expect(res.body.sellingPrice).toBe('29.99');
      expect(res.body.stockQuantity).toBe(0);
      expect(res.body.isActive).toBe(true);
      expect(res.body.category).toEqual({
        id: categoryId,
        name: `E2E Products ${uniqueSuffix}`,
        slug: expect.any(String),
      });
      expect(res.body.brand).toBeNull();
      expect(res.body.images).toEqual([]);
    });

    it('creates a full product with brand, images, and inventory fields', async () => {
      const res = await createProduct({
        name: `E2E Product ${uniqueSuffix} Full`,
        description: 'A full product',
        shortDescription: 'Full product',
        sku: `SKU-${uniqueSuffix}-FULL`,
        categoryId,
        brandId,
        unit: 'piece',
        sellingPrice: 49.5,
        compareAtPrice: 59.5,
        stockQuantity: 10,
        lowStockThreshold: 3,
        weight: 0.35,
        length: 10,
        width: 8,
        height: 9,
        isActive: true,
        imageIds: [imageIdA, imageIdB],
      }).expect(201);

      expect(res.body.sku).toBe(`SKU-${uniqueSuffix}-FULL`);
      expect(res.body.brand).toEqual({
        id: brandId,
        name: `E2E Products ${uniqueSuffix}`,
        slug: expect.any(String),
      });
      expect(res.body.unit).toBe('piece');
      expect(typeof res.body.compareAtPrice).toBe('string');
      expect(Number(res.body.compareAtPrice)).toBe(59.5);
      expect(res.body.images).toHaveLength(2);
      expect(res.body.images[0]).toMatchObject({
        sortOrder: 0,
        isPrimary: true,
        image: {
          id: imageIdA,
          url: `/api/images/${imageIdA}/file`,
          originalName: `product-a-${uniqueSuffix}.png`,
        },
      });
      expect(res.body.images[1]).toMatchObject({
        sortOrder: 1,
        isPrimary: false,
        image: { id: imageIdB },
      });
    });

    it('rejects a duplicate slug', async () => {
      const slug = `e2e-${uniqueSuffix}-taken`;

      await createProduct({
        name: `E2E Product ${uniqueSuffix} Slug A`,
        slug,
        categoryId,
        sellingPrice: 10,
      }).expect(201);

      await createProduct({
        name: `E2E Product ${uniqueSuffix} Slug B`,
        slug,
        categoryId,
        sellingPrice: 10,
      }).expect(409);
    });

    it('auto-suffixes a generated slug when it is already taken', async () => {
      const name = `E2E Product ${uniqueSuffix} Auto Suffix`;

      await createProduct({
        name,
        categoryId,
        sellingPrice: 10,
      }).expect(201);

      const res = await createProduct({
        name: `${name}?`,
        categoryId,
        sellingPrice: 10,
      }).expect(201);

      expect(res.body.slug).toBe(
        `e2e-product-${uniqueSuffix}-auto-suffix-2`.toLowerCase(),
      );
    });

    it('rejects a duplicate SKU', async () => {
      const sku = `SKU-${uniqueSuffix}-DUP`;

      await createProduct({
        name: `E2E Product ${uniqueSuffix} SKU A`,
        sku,
        categoryId,
        sellingPrice: 10,
      }).expect(201);

      await createProduct({
        name: `E2E Product ${uniqueSuffix} SKU B`,
        sku,
        categoryId,
        sellingPrice: 10,
      }).expect(409);
    });

    it('normalizes SKU to uppercase', async () => {
      const res = await createProduct({
        name: `E2E Product ${uniqueSuffix} Case`,
        sku: `sku-${uniqueSuffix}-case`,
        categoryId,
        sellingPrice: 10,
      }).expect(201);

      expect(res.body.sku).toBe(`SKU-${uniqueSuffix}-CASE`);
    });

    it('rejects a missing name', async () => {
      await createProduct({ categoryId, sellingPrice: 10 }).expect(400);
    });

    it('rejects a negative selling price', async () => {
      await createProduct({
        name: `E2E Product ${uniqueSuffix} Negative`,
        categoryId,
        sellingPrice: -1,
      }).expect(400);
    });

    it('rejects a negative stock quantity', async () => {
      await createProduct({
        name: `E2E Product ${uniqueSuffix} Neg Stock`,
        categoryId,
        sellingPrice: 10,
        stockQuantity: -1,
      }).expect(400);
    });

    it('rejects negative dimensions and thresholds', async () => {
      await createProduct({
        name: `E2E Product ${uniqueSuffix} Neg Dim`,
        categoryId,
        sellingPrice: 10,
        weight: -0.5,
      }).expect(400);

      await createProduct({
        name: `E2E Product ${uniqueSuffix} Neg Threshold`,
        categoryId,
        sellingPrice: 10,
        lowStockThreshold: -1,
      }).expect(400);
    });

    it('rejects a missing category reference', async () => {
      await createProduct({
        name: `E2E Product ${uniqueSuffix} No Category`,
        sellingPrice: 10,
      }).expect(400);
    });

    it('rejects an unknown category id', async () => {
      await createProduct({
        name: `E2E Product ${uniqueSuffix} Bad Category`,
        categoryId: '00000000-0000-4000-8000-000000000000',
        sellingPrice: 10,
      }).expect(404);
    });

    it('rejects an unknown brand id', async () => {
      await createProduct({
        name: `E2E Product ${uniqueSuffix} Bad Brand`,
        categoryId,
        brandId: '00000000-0000-4000-8000-000000000000',
        sellingPrice: 10,
      }).expect(404);
    });

    it('rejects unknown image ids', async () => {
      await createProduct({
        name: `E2E Product ${uniqueSuffix} Bad Image`,
        categoryId,
        sellingPrice: 10,
        imageIds: ['00000000-0000-4000-8000-000000000000'],
      }).expect(404);
    });

    it('rejects duplicate image ids', async () => {
      await createProduct({
        name: `E2E Product ${uniqueSuffix} Dup Image`,
        categoryId,
        sellingPrice: 10,
        imageIds: [imageIdA, imageIdA],
      }).expect(400);
    });

    it('rejects unknown properties', async () => {
      await createProduct({
        name: `E2E Product ${uniqueSuffix} Unknown`,
        categoryId,
        sellingPrice: 10,
        colour: 'red',
      }).expect(400);
    });
  });

  describe('GET /products', () => {
    it('lists products with pagination metadata', async () => {
      const res = await request(app.getHttpServer())
        .get('/products')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ page: 1, limit: 2 })
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
      expect(res.body.meta).toEqual({
        page: 1,
        limit: 2,
        total: expect.any(Number),
        totalPages: expect.any(Number),
      });
    });

    it('searches products by name', async () => {
      const name = `E2E Product ${uniqueSuffix} Searchable`;

      await createProduct({ name, categoryId, sellingPrice: 15 }).expect(201);

      const res = await request(app.getHttpServer())
        .get('/products')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ search: 'searchable', limit: 50 })
        .expect(200);

      expect(
        res.body.data.some(
          (product: { name: string }) => product.name === name,
        ),
      ).toBe(true);
    });

    it('filters by categoryId, brandId, and isActive', async () => {
      const byCategory = await request(app.getHttpServer())
        .get('/products')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ categoryId, limit: 50 })
        .expect(200);

      expect(
        byCategory.body.data.every(
          (product: { category: { id: string } }) =>
            product.category.id === categoryId,
        ),
      ).toBe(true);

      const byBrand = await request(app.getHttpServer())
        .get('/products')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ brandId, limit: 50 })
        .expect(200);

      expect(
        byBrand.body.data.every(
          (product: { brand: { id: string } | null }) =>
            product.brand?.id === brandId,
        ),
      ).toBe(true);

      const inactive = await request(app.getHttpServer())
        .get('/products')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ isActive: 'false', limit: 50 })
        .expect(200);

      expect(
        inactive.body.data.every(
          (product: { isActive: boolean }) => product.isActive === false,
        ),
      ).toBe(true);
    });

    it('filters by selling price range', async () => {
      await createProduct({
        name: `E2E Product ${uniqueSuffix} Cheap`,
        categoryId,
        sellingPrice: 1.5,
      }).expect(201);

      const res = await request(app.getHttpServer())
        .get('/products')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ minPrice: 1, maxPrice: 2, limit: 50 })
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
      expect(
        res.body.data.every(
          (product: { sellingPrice: string }) =>
            Number(product.sellingPrice) >= 1 && Number(product.sellingPrice) <= 2,
        ),
      ).toBe(true);
    });

    it('filters low-stock products', async () => {
      await createProduct({
        name: `E2E Product ${uniqueSuffix} Low Stock`,
        categoryId,
        sellingPrice: 20,
        stockQuantity: 1,
        lowStockThreshold: 5,
      }).expect(201);

      const res = await request(app.getHttpServer())
        .get('/products')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ lowStock: 'true', limit: 50 })
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
      expect(
        res.body.data.every(
          (product: {
            stockQuantity: number;
            lowStockThreshold: number | null;
          }) =>
            product.lowStockThreshold !== null &&
            product.stockQuantity <= product.lowStockThreshold,
        ),
      ).toBe(true);
    });

    it('sorts by selling price ascending', async () => {
      const res = await request(app.getHttpServer())
        .get('/products')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ sortBy: 'sellingPrice', sortOrder: 'asc', limit: 50 })
        .expect(200);

      const prices = res.body.data.map(
        (product: { sellingPrice: string }) => Number(product.sellingPrice),
      );
      const sorted = [...prices].sort((a, b) => a - b);
      expect(prices).toEqual(sorted);
    });

    it('rejects an invalid sortBy value', async () => {
      await request(app.getHttpServer())
        .get('/products')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ sortBy: 'colour' })
        .expect(400);
    });

    it('rejects minPrice greater than maxPrice', async () => {
      await request(app.getHttpServer())
        .get('/products')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ minPrice: 50, maxPrice: 10 })
        .expect(400);
    });

    it('rejects an invalid page value', async () => {
      await request(app.getHttpServer())
        .get('/products')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ page: 0 })
        .expect(400);
    });

    it('rejects a limit above the maximum page size', async () => {
      await request(app.getHttpServer())
        .get('/products')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ limit: 101 })
        .expect(400);
    });
  });

  describe('GET /products/:id', () => {
    it('retrieves a product by id with images', async () => {
      const created = await createProduct({
        name: `E2E Product ${uniqueSuffix} Retrieve`,
        categoryId,
        sellingPrice: 12,
        imageIds: [imageIdA],
      }).expect(201);

      const res = await request(app.getHttpServer())
        .get(`/products/${created.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(200);

      expect(res.body.id).toBe(created.body.id);
      expect(res.body.images).toHaveLength(1);
      expect(res.body.images[0].image.id).toBe(imageIdA);
      expect(res.body.images[0].isPrimary).toBe(true);
    });

    it('returns 404 for a missing product', async () => {
      await request(app.getHttpServer())
        .get('/products/00000000-0000-4000-8000-000000000000')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(404);
    });

    it('returns 400 for an invalid id', async () => {
      await request(app.getHttpServer())
        .get('/products/not-a-uuid')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(400);
    });
  });

  describe('PATCH /products/:id', () => {
    it('updates only the supplied fields', async () => {
      const created = await createProduct({
        name: `E2E Product ${uniqueSuffix} Updatable`,
        categoryId,
        sellingPrice: 30,
        stockQuantity: 5,
      }).expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/products/${created.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ sellingPrice: 35.5 })
        .expect(200);

      expect(res.body.name).toBe(created.body.name);
      expect(Number(res.body.sellingPrice)).toBe(35.5);
      expect(res.body.stockQuantity).toBe(5);
    });

    it('clears brand when brandId is null', async () => {
      const created = await createProduct({
        name: `E2E Product ${uniqueSuffix} Clear Brand`,
        categoryId,
        brandId,
        sellingPrice: 10,
      }).expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/products/${created.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ brandId: null })
        .expect(200);

      expect(res.body.brand).toBeNull();
    });

    it('clears SKU when sku is null', async () => {
      const created = await createProduct({
        name: `E2E Product ${uniqueSuffix} Clear SKU`,
        sku: `SKU-${uniqueSuffix}-CLEAR`,
        categoryId,
        sellingPrice: 10,
      }).expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/products/${created.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ sku: null })
        .expect(200);

      expect(res.body.sku).toBeNull();
    });

    it('does not modify images during unrelated updates', async () => {
      const created = await createProduct({
        name: `E2E Product ${uniqueSuffix} Keep Images`,
        categoryId,
        sellingPrice: 10,
        imageIds: [imageIdA, imageIdB],
      }).expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/products/${created.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: `E2E Product ${uniqueSuffix} Keep Images Updated` })
        .expect(200);

      expect(res.body.images).toHaveLength(2);
    });

    it('rejects a slug already used by another product', async () => {
      const slug = `e2e-${uniqueSuffix}-patch-conflict`;

      await createProduct({
        name: `E2E Product ${uniqueSuffix} Patch A`,
        slug,
        categoryId,
        sellingPrice: 10,
      }).expect(201);

      const createdB = await createProduct({
        name: `E2E Product ${uniqueSuffix} Patch B`,
        categoryId,
        sellingPrice: 10,
      }).expect(201);

      await request(app.getHttpServer())
        .patch(`/products/${createdB.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ slug })
        .expect(409);
    });

    it('rejects an invalid selling price', async () => {
      const created = await createProduct({
        name: `E2E Product ${uniqueSuffix} Bad Price`,
        categoryId,
        sellingPrice: 10,
      }).expect(201);

      await request(app.getHttpServer())
        .patch(`/products/${created.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ sellingPrice: -5 })
        .expect(400);
    });

    it('returns 404 for a missing product', async () => {
      await request(app.getHttpServer())
        .patch('/products/00000000-0000-4000-8000-000000000000')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: 'Ghost' })
        .expect(404);
    });
  });

  describe('product images management', () => {
    it('replaces and orders images, keeping the first as primary', async () => {
      const created = await createProduct({
        name: `E2E Product ${uniqueSuffix} Image Swap`,
        categoryId,
        sellingPrice: 10,
        imageIds: [imageIdA],
      }).expect(201);

      const res = await request(app.getHttpServer())
        .put(`/products/${created.body.id}/images`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ imageIds: [imageIdB, imageIdA] })
        .expect(200);

      expect(res.body.images).toHaveLength(2);
      expect(res.body.images[0]).toMatchObject({
        sortOrder: 0,
        isPrimary: true,
        image: { id: imageIdB },
      });
      expect(res.body.images[1]).toMatchObject({
        sortOrder: 1,
        isPrimary: false,
        image: { id: imageIdA },
      });
    });

    it('clears all images with an empty list', async () => {
      const created = await createProduct({
        name: `E2E Product ${uniqueSuffix} Image Clear`,
        categoryId,
        sellingPrice: 10,
        imageIds: [imageIdA, imageIdB],
      }).expect(201);

      const res = await request(app.getHttpServer())
        .put(`/products/${created.body.id}/images`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ imageIds: [] })
        .expect(200);

      expect(res.body.images).toEqual([]);
    });

    it('rejects duplicate image ids when replacing', async () => {
      const created = await createProduct({
        name: `E2E Product ${uniqueSuffix} Image Dup`,
        categoryId,
        sellingPrice: 10,
      }).expect(201);

      await request(app.getHttpServer())
        .put(`/products/${created.body.id}/images`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ imageIds: [imageIdA, imageIdA] })
        .expect(400);
    });

    it('returns 404 when replacing images of a missing product', async () => {
      await request(app.getHttpServer())
        .put('/products/00000000-0000-4000-8000-000000000000/images')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ imageIds: [] })
        .expect(404);
    });

    it('removes an image association without deleting the image', async () => {
      const created = await createProduct({
        name: `E2E Product ${uniqueSuffix} Image Remove`,
        categoryId,
        sellingPrice: 10,
        imageIds: [imageIdA, imageIdB],
      }).expect(201);

      await request(app.getHttpServer())
        .delete(`/products/${created.body.id}/images/${imageIdA}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(204);

      const res = await request(app.getHttpServer())
        .get(`/products/${created.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(200);

      expect(res.body.images).toHaveLength(1);
      expect(res.body.images[0].image.id).toBe(imageIdB);
      expect(res.body.images[0].isPrimary).toBe(true);

      await request(app.getHttpServer())
        .get(`/images/${imageIdA}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(200);
    });

    it('returns 404 when removing an unassociated image', async () => {
      const created = await createProduct({
        name: `E2E Product ${uniqueSuffix} Image Not Assoc`,
        categoryId,
        sellingPrice: 10,
      }).expect(201);

      await request(app.getHttpServer())
        .delete(`/products/${created.body.id}/images/${imageIdA}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(404);
    });
  });

  describe('DELETE /products/:id', () => {
    it('deletes a product and returns 204', async () => {
      const created = await createProduct({
        name: `E2E Product ${uniqueSuffix} Deletable`,
        categoryId,
        sellingPrice: 10,
        imageIds: [imageIdA],
      }).expect(201);

      await request(app.getHttpServer())
        .delete(`/products/${created.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(204);

      await request(app.getHttpServer())
        .get(`/products/${created.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(404);

      await request(app.getHttpServer())
        .get(`/images/${imageIdA}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(200);
    });

    it('returns 404 when deleting a missing product', async () => {
      await request(app.getHttpServer())
        .delete('/products/00000000-0000-4000-8000-000000000000')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(404);
    });

    it('prevents deleting a category that is referenced by products', async () => {
      const categoryRes = await request(app.getHttpServer())
        .post('/categories')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: `E2E Protected ${uniqueSuffix}` })
        .expect(201);

      await createProduct({
        name: `E2E Product ${uniqueSuffix} Protected`,
        categoryId: categoryRes.body.id,
        sellingPrice: 10,
      }).expect(201);

      await request(app.getHttpServer())
        .delete(`/categories/${categoryRes.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(409);
    });

    it('prevents deleting a brand that is referenced by products', async () => {
      const brandRes = await request(app.getHttpServer())
        .post('/brands')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: `E2E Protected ${uniqueSuffix}` })
        .expect(201);

      await createProduct({
        name: `E2E Product ${uniqueSuffix} Brand Protected`,
        categoryId,
        brandId: brandRes.body.id,
        sellingPrice: 10,
      }).expect(201);

      await request(app.getHttpServer())
        .delete(`/brands/${brandRes.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(409);
    });
  });
});
