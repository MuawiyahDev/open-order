import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AppModule } from './../src/app.module.js';

const TEST_API_KEY = 'e2e-test-api-key';

describe('Categories (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;
  let prisma: PrismaService;

  const uniqueSuffix = Date.now().toString();
  const createdNames: string[] = [];

  function track(name: string): string {
    createdNames.push(name);
    return name;
  }

  function auth() {
    return { Authorization: `Bearer ${accessToken}` };
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'e2e-test-secret';
    process.env.API_KEY = TEST_API_KEY;

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

    const email = `categories-e2e-${uniqueSuffix}@example.com`;
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
  });

  afterAll(async () => {
    await prisma.client.category.deleteMany({
      where: { name: { startsWith: `E2E ${uniqueSuffix}` } },
    });
    await app.close();
  });

  describe('authentication', () => {
    it('rejects requests without an API key', async () => {
      await request(app.getHttpServer()).get('/categories').expect(401);
    });

    it('rejects requests without a JWT', async () => {
      await request(app.getHttpServer())
        .get('/categories')
        .set('x-api-key', TEST_API_KEY)
        .expect(401);
    });

    it('rejects requests with an invalid JWT', async () => {
      await request(app.getHttpServer())
        .get('/categories')
        .set('x-api-key', TEST_API_KEY)
        .set('Authorization', 'Bearer garbage-token')
        .expect(401);
    });
  });

  describe('POST /categories', () => {
    it('creates a category with a generated slug', async () => {
      const name = track(`E2E ${uniqueSuffix} Home Decor`);

      const res = await request(app.getHttpServer())
        .post('/categories')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name })
        .expect(201);

      expect(res.body.name).toBe(name);
      expect(res.body.slug).toBe(
        `e2e-${uniqueSuffix}-home-decor`.toLowerCase(),
      );
      expect(res.body.isActive).toBe(true);
      expect(res.body.id).toBeDefined();
      expect(res.body.createdAt).toBeDefined();
      expect(res.body.updatedAt).toBeDefined();
    });

    it('creates a category with an explicit slug and inactive status', async () => {
      const name = track(`E2E ${uniqueSuffix} Seasonal`);

      const res = await request(app.getHttpServer())
        .post('/categories')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name, slug: `e2e-${uniqueSuffix}-seasonal`, isActive: false })
        .expect(201);

      expect(res.body.slug).toBe(`e2e-${uniqueSuffix}-seasonal`);
      expect(res.body.isActive).toBe(false);
    });

    it('rejects a duplicate name', async () => {
      const name = track(`E2E ${uniqueSuffix} Duplicate`);

      await request(app.getHttpServer())
        .post('/categories')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name })
        .expect(201);

      await request(app.getHttpServer())
        .post('/categories')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name })
        .expect(409);
    });

    it('rejects a duplicate slug', async () => {
      const slug = `e2e-${uniqueSuffix}-taken-slug`;

      await request(app.getHttpServer())
        .post('/categories')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: track(`E2E ${uniqueSuffix} Slug A`), slug })
        .expect(201);

      await request(app.getHttpServer())
        .post('/categories')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: track(`E2E ${uniqueSuffix} Slug B`), slug })
        .expect(409);
    });

    it('auto-suffixes a generated slug when it is already taken', async () => {
      const first = track(`E2E ${uniqueSuffix} Auto Suffix`);
      const second = track(`E2E ${uniqueSuffix} Auto Suffix?`);

      await request(app.getHttpServer())
        .post('/categories')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: first })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/categories')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: second })
        .expect(201);

      expect(res.body.slug).toBe(`e2e-${uniqueSuffix}-auto-suffix-2`);
    });

    it('rejects an empty name', async () => {
      await request(app.getHttpServer())
        .post('/categories')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: '   ' })
        .expect(400);
    });

    it('rejects a name that produces an empty slug', async () => {
      await request(app.getHttpServer())
        .post('/categories')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: '!!!' })
        .expect(400);
    });

    it('rejects unknown properties', async () => {
      await request(app.getHttpServer())
        .post('/categories')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: track(`E2E ${uniqueSuffix} Unknown`), colour: 'red' })
        .expect(400);
    });
  });

  describe('GET /categories', () => {
    it('lists categories with pagination metadata', async () => {
      const res = await request(app.getHttpServer())
        .get('/categories')
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
      expect(res.body.meta.total).toBeGreaterThanOrEqual(res.body.data.length);
    });

    it('searches categories by name', async () => {
      const name = track(`E2E ${uniqueSuffix} Searchable`);

      await request(app.getHttpServer())
        .post('/categories')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/categories')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ search: 'searchable', limit: 50 })
        .expect(200);

      expect(
        res.body.data.some(
          (category: { name: string }) => category.name === name,
        ),
      ).toBe(true);
      expect(
        res.body.data.every((category: { name: string }) =>
          category.name.toLowerCase().includes('searchable'),
        ),
      ).toBe(true);
    });

    it('filters categories by isActive', async () => {
      const res = await request(app.getHttpServer())
        .get('/categories')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ isActive: 'false', limit: 50 })
        .expect(200);

      expect(
        res.body.data.every(
          (category: { isActive: boolean }) => category.isActive === false,
        ),
      ).toBe(true);
    });

    it('rejects an invalid page value', async () => {
      await request(app.getHttpServer())
        .get('/categories')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ page: 0 })
        .expect(400);
    });

    it('rejects a limit above the maximum page size', async () => {
      await request(app.getHttpServer())
        .get('/categories')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ limit: 101 })
        .expect(400);
    });

    it('rejects an invalid isActive value', async () => {
      await request(app.getHttpServer())
        .get('/categories')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ isActive: 'maybe' })
        .expect(400);
    });
  });

  describe('GET /categories/:id', () => {
    it('retrieves a category by id', async () => {
      const name = track(`E2E ${uniqueSuffix} Retrieve`);

      const created = await request(app.getHttpServer())
        .post('/categories')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/categories/${created.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(200);

      expect(res.body.id).toBe(created.body.id);
      expect(res.body.name).toBe(name);
    });

    it('returns 404 for a missing category', async () => {
      await request(app.getHttpServer())
        .get('/categories/00000000-0000-4000-8000-000000000000')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(404);
    });

    it('returns 400 for an invalid id', async () => {
      await request(app.getHttpServer())
        .get('/categories/not-a-uuid')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(400);
    });
  });

  describe('PATCH /categories/:id', () => {
    it('updates name, slug, and isActive', async () => {
      const created = await request(app.getHttpServer())
        .post('/categories')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: track(`E2E ${uniqueSuffix} Updatable`) })
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/categories/${created.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({
          name: `E2E ${uniqueSuffix} Updated`,
          slug: `e2e-${uniqueSuffix}-updated`,
          isActive: false,
        })
        .expect(200);

      expect(res.body.name).toBe(`E2E ${uniqueSuffix} Updated`);
      expect(res.body.slug).toBe(`e2e-${uniqueSuffix}-updated`);
      expect(res.body.isActive).toBe(false);
    });

    it('allows renaming a category to its own name', async () => {
      const name = track(`E2E ${uniqueSuffix} Same Name`);

      const created = await request(app.getHttpServer())
        .post('/categories')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name })
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/categories/${created.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name })
        .expect(200);

      expect(res.body.name).toBe(name);
    });

    it('rejects a name already used by another category', async () => {
      const nameA = track(`E2E ${uniqueSuffix} Conflict A`);
      const nameB = track(`E2E ${uniqueSuffix} Conflict B`);

      await request(app.getHttpServer())
        .post('/categories')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: nameA })
        .expect(201);

      const createdB = await request(app.getHttpServer())
        .post('/categories')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: nameB })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/categories/${createdB.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: nameA })
        .expect(409);
    });

    it('returns 404 for a missing category', async () => {
      await request(app.getHttpServer())
        .patch('/categories/00000000-0000-4000-8000-000000000000')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: `E2E ${uniqueSuffix} Ghost` })
        .expect(404);
    });
  });

  describe('DELETE /categories/:id', () => {
    it('deletes a category and returns 204', async () => {
      const created = await request(app.getHttpServer())
        .post('/categories')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: track(`E2E ${uniqueSuffix} Deletable`) })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/categories/${created.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(204);

      await request(app.getHttpServer())
        .get(`/categories/${created.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(404);
    });

    it('returns 404 when deleting a missing category', async () => {
      await request(app.getHttpServer())
        .delete('/categories/00000000-0000-4000-8000-000000000000')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(404);
    });
  });
});
