import { access, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AppModule } from './../src/app.module.js';

const TEST_API_KEY = 'e2e-test-api-key';
const MAX_FILE_SIZE_BYTES = 1024;

function pngBuffer(width = 16, height = 8): Buffer {
  const buffer = Buffer.alloc(32);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

describe('Images (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;
  let prisma: PrismaService;
  let storageDir: string;

  const uniqueSuffix = Date.now().toString();

  function auth() {
    return { Authorization: `Bearer ${accessToken}` };
  }

  function uploadPng(
    filename = `photo-${uniqueSuffix}.png`,
    altText?: string,
  ) {
    const req = request(app.getHttpServer())
      .post('/images')
      .set('x-api-key', TEST_API_KEY)
      .set(auth())
      .attach('file', pngBuffer(), filename);

    if (altText !== undefined) {
      req.field('altText', altText);
    }

    return req;
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'e2e-test-secret';
    process.env.API_KEY = TEST_API_KEY;
    storageDir = await mkdtemp(join(tmpdir(), 'images-e2e-'));
    process.env.IMAGE_STORAGE_DIR = storageDir;
    process.env.IMAGE_MAX_FILE_SIZE = String(MAX_FILE_SIZE_BYTES);

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

    const email = `images-e2e-${uniqueSuffix}@example.com`;
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
    await prisma.client.image.deleteMany({
      where: { originalName: { contains: uniqueSuffix } },
    });
    await app.close();
    await rm(storageDir, { recursive: true, force: true });
  });

  describe('authentication', () => {
    it('rejects requests without an API key', async () => {
      await request(app.getHttpServer()).get('/images').expect(401);
    });

    it('rejects requests without a JWT', async () => {
      await request(app.getHttpServer())
        .get('/images')
        .set('x-api-key', TEST_API_KEY)
        .expect(401);
    });
  });

  describe('POST /images', () => {
    it('uploads a PNG image with metadata', async () => {
      const res = await uploadPng(`upload-${uniqueSuffix}.png`, 'A red hat')
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.originalName).toBe(`upload-${uniqueSuffix}.png`);
      expect(res.body.mimeType).toBe('image/png');
      expect(res.body.size).toBe(32);
      expect(res.body.width).toBe(16);
      expect(res.body.height).toBe(8);
      expect(res.body.altText).toBe('A red hat');
      expect(res.body.url).toBe(`/api/images/${res.body.id}/file`);
      expect(res.body.createdAt).toBeDefined();
      expect(res.body.updatedAt).toBeDefined();
      expect(res.body.storageKey).toBeUndefined();
    });

    it('stores the file on disk under a generated filename', async () => {
      const before = await readdir(storageDir);

      await uploadPng(`ondisk-${uniqueSuffix}.png`).expect(201);

      const after = await readdir(storageDir);
      expect(after.length).toBe(before.length + 1);
      expect(
        after.some((name) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/.test(
            name,
          ),
        ),
      ).toBe(true);
    });

    it('sanitizes path-like original filenames', async () => {
      const res = await uploadPng(`../../evil-${uniqueSuffix}.png`).expect(201);

      expect(res.body.originalName).toBe(`evil-${uniqueSuffix}.png`);
    });

    it('rejects a request without a file', async () => {
      await request(app.getHttpServer())
        .post('/images')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .field('altText', 'no file')
        .expect(400);
    });

    it('rejects an empty file', async () => {
      await request(app.getHttpServer())
        .post('/images')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .attach('file', Buffer.alloc(0), `empty-${uniqueSuffix}.png`)
        .expect(400);
    });

    it('rejects non-image content with a misleading MIME type', async () => {
      const res = await request(app.getHttpServer())
        .post('/images')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .attach('file', Buffer.from('definitely not an image'), 'fake.png', {
          contentType: 'image/png',
        })
        .expect(400);

      expect(res.body.message).toMatch(/Unsupported image format/);
    });

    it('rejects oversized files with 413', async () => {
      const oversized = Buffer.concat([
        pngBuffer(),
        Buffer.alloc(MAX_FILE_SIZE_BYTES),
      ]);

      await request(app.getHttpServer())
        .post('/images')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .attach('file', oversized, `big-${uniqueSuffix}.png`)
        .expect(413);
    });

    it('rejects unknown multipart fields', async () => {
      await request(app.getHttpServer())
        .post('/images')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .attach('file', pngBuffer(), `unknown-${uniqueSuffix}.png`)
        .field('bogus', 'value')
        .expect(400);
    });
  });

  describe('GET /images', () => {
    it('lists images with pagination metadata', async () => {
      const res = await request(app.getHttpServer())
        .get('/images')
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

    it('searches images by original filename', async () => {
      const originalName = `findme-${uniqueSuffix}.png`;
      await uploadPng(originalName).expect(201);

      const res = await request(app.getHttpServer())
        .get('/images')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ search: `findme-${uniqueSuffix}`, limit: 50 })
        .expect(200);

      expect(
        res.body.data.every(
          (image: { originalName: string }) =>
            image.originalName.toLowerCase().includes(`findme-${uniqueSuffix}`),
        ),
      ).toBe(true);
      expect(
        res.body.data.some(
          (image: { originalName: string }) => image.originalName === originalName,
        ),
      ).toBe(true);
    });

    it('rejects invalid pagination values', async () => {
      await request(app.getHttpServer())
        .get('/images')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ page: 0 })
        .expect(400);

      await request(app.getHttpServer())
        .get('/images')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .query({ limit: 101 })
        .expect(400);
    });
  });

  describe('GET /images/:id', () => {
    it('retrieves image metadata by id', async () => {
      const created = await uploadPng(`single-${uniqueSuffix}.png`).expect(201);

      const res = await request(app.getHttpServer())
        .get(`/images/${created.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(200);

      expect(res.body.id).toBe(created.body.id);
      expect(res.body.originalName).toBe(`single-${uniqueSuffix}.png`);
      expect(res.body.storageKey).toBeUndefined();
    });

    it('returns 404 for a missing image and 400 for an invalid id', async () => {
      await request(app.getHttpServer())
        .get('/images/00000000-0000-4000-8000-000000000000')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(404);

      await request(app.getHttpServer())
        .get('/images/not-a-uuid')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(400);
    });
  });

  describe('GET /images/:id/file', () => {
    it('serves the stored image bytes', async () => {
      const png = pngBuffer(24, 12);
      const created = await request(app.getHttpServer())
        .post('/images')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .attach('file', png, `served-${uniqueSuffix}.png`)
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/images/${created.body.id}/file`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(200);

      expect(res.headers['content-type']).toContain('image/png');
      expect(Buffer.isBuffer(res.body)).toBe(true);
      expect(res.body.equals(png)).toBe(true);
    });

    it('returns 404 for a missing image', async () => {
      await request(app.getHttpServer())
        .get('/images/00000000-0000-4000-8000-000000000000/file')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(404);
    });
  });

  describe('DELETE /images/:id', () => {
    it('deletes the image, its file, and returns 204', async () => {
      const created = await uploadPng(`deleteme-${uniqueSuffix}.png`).expect(201);
      const filesAfterUpload = await readdir(storageDir);

      await request(app.getHttpServer())
        .delete(`/images/${created.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(204);

      const filesAfterDelete = await readdir(storageDir);
      expect(filesAfterDelete.length).toBe(filesAfterUpload.length - 1);

      await request(app.getHttpServer())
        .get(`/images/${created.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/images/${created.body.id}`)
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(404);
    });

    it('returns 404 when deleting a missing image', async () => {
      await request(app.getHttpServer())
        .delete('/images/00000000-0000-4000-8000-000000000000')
        .set('x-api-key', TEST_API_KEY)
        .set(auth())
        .expect(404);
    });
  });

  it('never writes outside the configured storage directory', async () => {
    await uploadPng(`escape-check-${uniqueSuffix}.png`).expect(201);

    const parentEntries = await readdir(join(storageDir, '..'));
    expect(
      parentEntries.filter((name) => name.startsWith('escape-check-')),
    ).toEqual([]);
  });

  it('keeps the storage directory free of unexpected path segments', async () => {
    const entries = await readdir(storageDir, { recursive: true });
    expect(entries.every((entry) => !String(entry).includes('/'))).toBe(true);
    await expect(access(storageDir)).resolves.toBeUndefined();
  });
});
