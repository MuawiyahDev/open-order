import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, type Customer } from '@repo/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { CustomersService } from './customers.service.js';
import type { CreateCustomerDto } from './dto/create-customer.dto.js';

const customerFixture: Customer = {
  id: '3f1d2c9a-0000-4000-8000-000000000001',
  name: 'Ayesha Rahman',
  phone: '+8801712345678',
  email: 'ayesha@example.com',
  address: 'House 12, Road 5',
  city: 'Dhaka',
  postalCode: '1207',
  notes: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function foreignKeyViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Foreign key constraint failed',
    {
      code: 'P2003',
      clientVersion: 'test',
    },
  );
}

describe('CustomersService', () => {
  let service: CustomersService;
  const prismaMock = {
    client: {
      customer: {
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
        CustomersService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = moduleRef.get(CustomersService);
  });

  describe('create', () => {
    const dto: CreateCustomerDto = {
      name: 'Ayesha Rahman',
      phone: '+8801712345678',
    };

    it('creates a customer with normalized phone and null defaults', async () => {
      prismaMock.client.customer.create.mockResolvedValue(customerFixture);

      const result = await service.create(dto);

      expect(prismaMock.client.customer.create).toHaveBeenCalledWith({
        data: {
          name: 'Ayesha Rahman',
          phone: '+8801712345678',
          email: null,
          address: null,
          city: null,
          postalCode: null,
          notes: null,
        },
      });
      expect(result).toEqual(customerFixture);
    });

    it('normalizes a phone number written with separators', async () => {
      prismaMock.client.customer.create.mockResolvedValue(customerFixture);

      await service.create({ ...dto, phone: '+880 (17) 1234-5678' });

      expect(prismaMock.client.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ phone: '+8801712345678' }),
        }),
      );
    });

    it('lowercases and trims the email address', async () => {
      prismaMock.client.customer.create.mockResolvedValue(customerFixture);

      await service.create({ ...dto, email: '  Ayesha@Example.COM ' });

      expect(prismaMock.client.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'ayesha@example.com' }),
        }),
      );
    });

    it('stores a blank optional field as null', async () => {
      prismaMock.client.customer.create.mockResolvedValue(customerFixture);

      await service.create({ ...dto, email: null, address: null });

      expect(prismaMock.client.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: null, address: null }),
        }),
      );
    });

    it('allows two customers to share the same phone number', async () => {
      prismaMock.client.customer.create.mockResolvedValue(customerFixture);

      await service.create(dto);
      await service.create({ ...dto, name: 'Rahim Rahman' });

      expect(prismaMock.client.customer.create).toHaveBeenCalledTimes(2);
    });

    it('rejects a phone number with invalid characters', async () => {
      await expect(
        service.create({ ...dto, phone: 'not-a-phone' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.client.customer.create).not.toHaveBeenCalled();
    });

    it('rejects a phone number with too few digits', async () => {
      await expect(
        service.create({ ...dto, phone: '12345' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.client.customer.create).not.toHaveBeenCalled();
    });

    it('does not swallow unexpected database errors', async () => {
      const dbError = new Error('connection lost');
      prismaMock.client.customer.create.mockRejectedValue(dbError);

      await expect(service.create(dto)).rejects.toBe(dbError);
    });
  });

  describe('findAll', () => {
    it('returns paginated results with default page and limit', async () => {
      prismaMock.client.customer.findMany.mockResolvedValue([customerFixture]);
      prismaMock.client.customer.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect(prismaMock.client.customer.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        data: [customerFixture],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
    });

    it('applies page and limit', async () => {
      prismaMock.client.customer.findMany.mockResolvedValue([]);
      prismaMock.client.customer.count.mockResolvedValue(0);

      await service.findAll({ page: 3, limit: 10 });

      expect(prismaMock.client.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('searches by name and email', async () => {
      prismaMock.client.customer.findMany.mockResolvedValue([]);
      prismaMock.client.customer.count.mockResolvedValue(0);

      await service.findAll({ search: 'ayesha' });

      expect(prismaMock.client.customer.findMany).toHaveBeenCalledWith({
        where: {
          AND: [
            {
              OR: [
                { name: { contains: 'ayesha', mode: 'insensitive' } },
                { email: { contains: 'ayesha', mode: 'insensitive' } },
              ],
            },
          ],
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
    });

    it('also searches by normalized phone when the term looks like a phone number', async () => {
      prismaMock.client.customer.findMany.mockResolvedValue([]);
      prismaMock.client.customer.count.mockResolvedValue(0);

      await service.findAll({ search: '+880 (17) 1234-5678' });

      expect(prismaMock.client.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {
                OR: [
                  {
                    name: {
                      contains: '+880 (17) 1234-5678',
                      mode: 'insensitive',
                    },
                  },
                  {
                    email: {
                      contains: '+880 (17) 1234-5678',
                      mode: 'insensitive',
                    },
                  },
                  { phone: { contains: '+8801712345678' } },
                ],
              },
            ],
          },
        }),
      );
    });

    it('skips the phone condition when normalization yields no digits', async () => {
      prismaMock.client.customer.findMany.mockResolvedValue([]);
      prismaMock.client.customer.count.mockResolvedValue(0);

      await service.findAll({ search: '---' });

      expect(prismaMock.client.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {
                OR: [
                  { name: { contains: '---', mode: 'insensitive' } },
                  { email: { contains: '---', mode: 'insensitive' } },
                ],
              },
            ],
          },
        }),
      );
    });

    it('treats an empty search string as no search filter', async () => {
      prismaMock.client.customer.findMany.mockResolvedValue([]);
      prismaMock.client.customer.count.mockResolvedValue(0);

      await service.findAll({ search: '' });

      expect(prismaMock.client.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('sorts by name ascending by default', async () => {
      prismaMock.client.customer.findMany.mockResolvedValue([]);
      prismaMock.client.customer.count.mockResolvedValue(0);

      await service.findAll({ sortBy: 'name' });

      expect(prismaMock.client.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'asc' } }),
      );
    });

    it('sorts by the requested field and direction', async () => {
      prismaMock.client.customer.findMany.mockResolvedValue([]);
      prismaMock.client.customer.count.mockResolvedValue(0);

      await service.findAll({ sortBy: 'updatedAt', sortOrder: 'asc' });

      expect(prismaMock.client.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { updatedAt: 'asc' } }),
      );
    });

    it('returns zero total pages when nothing matches', async () => {
      prismaMock.client.customer.findMany.mockResolvedValue([]);
      prismaMock.client.customer.count.mockResolvedValue(0);

      const result = await service.findAll({});

      expect(result.meta.totalPages).toBe(0);
    });
  });

  describe('findOne', () => {
    it('returns the customer when it exists', async () => {
      prismaMock.client.customer.findUnique.mockResolvedValue(customerFixture);

      await expect(service.findOne(customerFixture.id)).resolves.toEqual(
        customerFixture,
      );
    });

    it('throws not found for a missing customer', async () => {
      prismaMock.client.customer.findUnique.mockResolvedValue(null);

      await expect(service.findOne(customerFixture.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates only the supplied fields', async () => {
      prismaMock.client.customer.findUnique.mockResolvedValue(customerFixture);
      prismaMock.client.customer.update.mockResolvedValue({
        ...customerFixture,
        city: 'Chattogram',
      });

      const result = await service.update(customerFixture.id, {
        city: 'Chattogram',
      });

      expect(prismaMock.client.customer.update).toHaveBeenCalledWith({
        where: { id: customerFixture.id },
        data: { city: 'Chattogram' },
      });
      expect(result.city).toBe('Chattogram');
    });

    it('clears an optional field when null is supplied', async () => {
      prismaMock.client.customer.findUnique.mockResolvedValue(customerFixture);
      prismaMock.client.customer.update.mockResolvedValue({
        ...customerFixture,
        email: null,
      });

      await service.update(customerFixture.id, { email: null });

      expect(prismaMock.client.customer.update).toHaveBeenCalledWith({
        where: { id: customerFixture.id },
        data: { email: null },
      });
    });

    it('normalizes the phone number on update', async () => {
      prismaMock.client.customer.findUnique.mockResolvedValue(customerFixture);
      prismaMock.client.customer.update.mockResolvedValue(customerFixture);

      await service.update(customerFixture.id, { phone: '001 (202) 555-0193' });

      expect(prismaMock.client.customer.update).toHaveBeenCalledWith({
        where: { id: customerFixture.id },
        data: { phone: '+12025550193' },
      });
    });

    it('lowercases the email address on update', async () => {
      prismaMock.client.customer.findUnique.mockResolvedValue(customerFixture);
      prismaMock.client.customer.update.mockResolvedValue(customerFixture);

      await service.update(customerFixture.id, { email: 'New@Example.com' });

      expect(prismaMock.client.customer.update).toHaveBeenCalledWith({
        where: { id: customerFixture.id },
        data: { email: 'new@example.com' },
      });
    });

    it('rejects an invalid phone number', async () => {
      prismaMock.client.customer.findUnique.mockResolvedValue(customerFixture);

      await expect(
        service.update(customerFixture.id, { phone: '12' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.client.customer.update).not.toHaveBeenCalled();
    });

    it('throws not found for a missing customer', async () => {
      prismaMock.client.customer.findUnique.mockResolvedValue(null);

      await expect(
        service.update(customerFixture.id, { name: 'Nope' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.client.customer.update).not.toHaveBeenCalled();
    });

    it('returns the existing customer unchanged when no fields are provided', async () => {
      prismaMock.client.customer.findUnique.mockResolvedValue(customerFixture);

      const result = await service.update(customerFixture.id, {});

      expect(result).toEqual(customerFixture);
      expect(prismaMock.client.customer.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes an existing customer', async () => {
      prismaMock.client.customer.findUnique.mockResolvedValue({
        id: customerFixture.id,
      });
      prismaMock.client.customer.delete.mockResolvedValue(customerFixture);

      await expect(service.remove(customerFixture.id)).resolves.toBeUndefined();
      expect(prismaMock.client.customer.delete).toHaveBeenCalledWith({
        where: { id: customerFixture.id },
      });
    });

    it('throws not found for a missing customer', async () => {
      prismaMock.client.customer.findUnique.mockResolvedValue(null);

      await expect(service.remove(customerFixture.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prismaMock.client.customer.delete).not.toHaveBeenCalled();
    });

    it('maps a foreign key violation to a conflict', async () => {
      prismaMock.client.customer.findUnique.mockResolvedValue({
        id: customerFixture.id,
      });
      prismaMock.client.customer.delete.mockRejectedValue(
        foreignKeyViolation(),
      );

      await expect(service.remove(customerFixture.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('does not swallow unexpected database errors', async () => {
      const dbError = new Error('connection lost');
      prismaMock.client.customer.findUnique.mockResolvedValue({
        id: customerFixture.id,
      });
      prismaMock.client.customer.delete.mockRejectedValue(dbError);

      await expect(service.remove(customerFixture.id)).rejects.toBe(dbError);
    });
  });
});
