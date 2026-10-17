import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AppModule } from './../src/app.module.js';

const TEST_API_KEY = 'e2e-test-api-key';

describe('Customers (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;
  let prisma: PrismaService;

  const uniqueSuffix = Date.now().toString();
  const namePrefix = `E2E ${uniqueSuffix}`;

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

    const email = `customers-e2e-${uniqueSuffix}@example.com`;
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
    await prisma.client.customer.deleteMany({
      where: { name: { startsWith: namePrefix } },
    });
    await app.close();
  });

  describe('authentication', () => {
    it('rejects requests without an API key', async () => {
      await request(app.getHttpServer()).get('/customers').expect(401);
    });

    it('rejects requests without a JWT', async () => {
      await request(app.getHttpServer())
        .get('/customers')
        .set('x-api-key', TEST_API_KEY)
        .expect(401);
    });

    it('rejects requests with an invalid JWT', async () => {
      await request(app.getHttpServer())
        .get('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set('Authorization', 'Bearer garbage-token')
        .expect(401);
    });
  });

  describe('POST /customers', () => {
    it('creates a customer with normalized phone and email', async () => {
      const res = await request(app.getHttpServer())
        .post('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({
          name: `${namePrefix} Ayesha`,
          phone: '+880 (17) 1234-5678',
          email: '  Ayesha@Example.COM ',
          address: 'House 12, Road 5',
          city: 'Dhaka',
          postalCode: '1207',
          notes: 'Prefers evening delivery',
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe(`${namePrefix} Ayesha`);
      expect(res.body.phone).toBe('+8801712345678');
      expect(res.body.email).toBe('ayesha@example.com');
      expect(res.body.address).toBe('House 12, Road 5');
      expect(res.body.city).toBe('Dhaka');
      expect(res.body.postalCode).toBe('1207');
      expect(res.body.notes).toBe('Prefers evening delivery');
      expect(res.body.createdAt).toBeDefined();
      expect(res.body.updatedAt).toBeDefined();
    });

    it('creates a customer with only the required fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: `${namePrefix} Minimal`, phone: '01712345678' })
        .expect(201);

      expect(res.body.phone).toBe('01712345678');
      expect(res.body.email).toBeNull();
      expect(res.body.address).toBeNull();
      expect(res.body.city).toBeNull();
      expect(res.body.postalCode).toBeNull();
      expect(res.body.notes).toBeNull();
    });

    it('stores a blank optional field as null', async () => {
      const res = await request(app.getHttpServer())
        .post('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({
          name: `${namePrefix} Blanks`,
          phone: '01799999999',
          email: '',
          address: '  ',
        })
        .expect(201);

      expect(res.body.email).toBeNull();
      expect(res.body.address).toBeNull();
    });

    it('allows a second customer with the same phone number', async () => {
      const phone = '01722223333';

      await request(app.getHttpServer())
        .post('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: `${namePrefix} Dup A`, phone })
        .expect(201);

      await request(app.getHttpServer())
        .post('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: `${namePrefix} Dup B`, phone })
        .expect(201);
    });

    it('rejects a missing name', async () => {
      await request(app.getHttpServer())
        .post('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ phone: '01712345678' })
        .expect(400);
    });

    it('rejects an empty name', async () => {
      await request(app.getHttpServer())
        .post('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: '   ', phone: '01712345678' })
        .expect(400);
    });

    it('rejects a missing phone', async () => {
      await request(app.getHttpServer())
        .post('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: `${namePrefix} No Phone` })
        .expect(400);
    });

    it('rejects a phone number with too few digits', async () => {
      await request(app.getHttpServer())
        .post('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: `${namePrefix} Short Phone`, phone: '12345' })
        .expect(400);
    });

    it('rejects an invalid email address', async () => {
      await request(app.getHttpServer())
        .post('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({
          name: `${namePrefix} Bad Email`,
          phone: '01712345678',
          email: 'not-an-email',
        })
        .expect(400);
    });

    it('rejects unknown properties', async () => {
      await request(app.getHttpServer())
        .post('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({
          name: `${namePrefix} Unknown`,
          phone: '01712345678',
          loyaltyPoints: 100,
        })
        .expect(400);
    });
  });

  describe('GET /customers', () => {
    it('lists customers with pagination metadata', async () => {
      const res = await request(app.getHttpServer())
        .get('/customers')
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

    it('searches customers by name', async () => {
      const name = `${namePrefix} Searchable`;

      await request(app.getHttpServer())
        .post('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name, phone: '01733334444' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ search: 'searchable', limit: 100 })
        .expect(200);

      expect(
        res.body.data.some(
          (customer: { name: string }) => customer.name === name,
        ),
      ).toBe(true);
      expect(
        res.body.data.every((customer: { name: string }) =>
          customer.name.toLowerCase().includes('searchable'),
        ),
      ).toBe(true);
    });

    it('searches customers by formatted phone number', async () => {
      const res = await request(app.getHttpServer())
        .get('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ search: '+880 (17) 1234-5678', limit: 100 })
        .expect(200);

      expect(
        res.body.data.every(
          (customer: { phone: string }) => customer.phone === '+8801712345678',
        ),
      ).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('searches customers by email address', async () => {
      const res = await request(app.getHttpServer())
        .get('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ search: 'ayesha@example.com', limit: 100 })
        .expect(200);

      expect(
        res.body.data.every(
          (customer: { email: string | null }) =>
            customer.email === 'ayesha@example.com',
        ),
      ).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('sorts customers by name ascending', async () => {
      await request(app.getHttpServer())
        .post('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: `${namePrefix} Sort Zulu`, phone: '01755556666' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: `${namePrefix} Sort Alpha`, phone: '01755557777' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({
          search: namePrefix,
          sortBy: 'name',
          sortOrder: 'asc',
          limit: 100,
        })
        .expect(200);

      const names = res.body.data.map(
        (customer: { name: string }) => customer.name,
      );
      const alphaIndex = names.indexOf(`${namePrefix} Sort Alpha`);
      const zuluIndex = names.indexOf(`${namePrefix} Sort Zulu`);

      expect(alphaIndex).toBeGreaterThanOrEqual(0);
      expect(zuluIndex).toBeGreaterThan(alphaIndex);
    });

    it('rejects an invalid sortBy value', async () => {
      await request(app.getHttpServer())
        .get('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ sortBy: 'colour' })
        .expect(400);
    });

    it('rejects an invalid page value', async () => {
      await request(app.getHttpServer())
        .get('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ page: 0 })
        .expect(400);
    });

    it('rejects a limit above the maximum page size', async () => {
      await request(app.getHttpServer())
        .get('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ limit: 101 })
        .expect(400);
    });
  });

  describe('GET /customers/:id', () => {
    it('retrieves a customer by id', async () => {
      const created = await request(app.getHttpServer())
        .post('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: `${namePrefix} Retrieve`, phone: '01766667777' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/customers/${created.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(200);

      expect(res.body.id).toBe(created.body.id);
      expect(res.body.name).toBe(`${namePrefix} Retrieve`);
    });

    it('returns 404 for a missing customer', async () => {
      await request(app.getHttpServer())
        .get('/customers/00000000-0000-4000-8000-000000000000')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(404);
    });

    it('returns 400 for an invalid id', async () => {
      await request(app.getHttpServer())
        .get('/customers/not-a-uuid')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(400);
    });
  });

  describe('PATCH /customers/:id', () => {
    it('updates only the supplied fields', async () => {
      const created = await request(app.getHttpServer())
        .post('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({
          name: `${namePrefix} Updatable`,
          phone: '01777778888',
          email: 'updatable@example.com',
          city: 'Dhaka',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/customers/${created.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ city: 'Sylhet', phone: '+1 (202) 555-0193' })
        .expect(200);

      expect(res.body.city).toBe('Sylhet');
      expect(res.body.phone).toBe('+12025550193');
      expect(res.body.name).toBe(`${namePrefix} Updatable`);
      expect(res.body.email).toBe('updatable@example.com');
    });

    it('clears an optional field when null is supplied', async () => {
      const created = await request(app.getHttpServer())
        .post('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({
          name: `${namePrefix} Clearable`,
          phone: '01788889999',
          email: 'clearable@example.com',
          notes: 'some notes',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/customers/${created.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ email: null, notes: null })
        .expect(200);

      expect(res.body.email).toBeNull();
      expect(res.body.notes).toBeNull();
      expect(res.body.name).toBe(`${namePrefix} Clearable`);
    });

    it('rejects a null name', async () => {
      const created = await request(app.getHttpServer())
        .post('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: `${namePrefix} Null Name`, phone: '01799990000' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/customers/${created.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: null })
        .expect(400);
    });

    it('rejects an invalid phone number', async () => {
      const created = await request(app.getHttpServer())
        .post('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: `${namePrefix} Bad Patch Phone`, phone: '01700001111' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/customers/${created.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ phone: '12' })
        .expect(400);
    });

    it('rejects unknown properties', async () => {
      await request(app.getHttpServer())
        .patch('/customers/00000000-0000-4000-8000-000000000000')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ colour: 'red' })
        .expect(400);
    });

    it('returns 404 for a missing customer', async () => {
      await request(app.getHttpServer())
        .patch('/customers/00000000-0000-4000-8000-000000000000')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: `${namePrefix} Ghost` })
        .expect(404);
    });
  });

  describe('DELETE /customers/:id', () => {
    it('deletes a customer and returns 204', async () => {
      const created = await request(app.getHttpServer())
        .post('/customers')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .send({ name: `${namePrefix} Deletable`, phone: '01711112222' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/customers/${created.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(204);

      await request(app.getHttpServer())
        .get(`/customers/${created.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(404);
    });

    it('returns 404 when deleting a missing customer', async () => {
      await request(app.getHttpServer())
        .delete('/customers/00000000-0000-4000-8000-000000000000')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(404);
    });
  });
});
