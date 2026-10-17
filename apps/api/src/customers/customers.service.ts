import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Customer } from '@repo/database';
import {
  isPhoneLike,
  normalizePhone,
  PHONE_INVALID_MESSAGE,
  PHONE_PATTERN,
} from '../common/utils/phone.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { QueryCustomersDto } from './dto/query-customers.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';

export const DEFAULT_PAGE_SIZE = 20;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedCustomers {
  data: Customer[];
  meta: PaginationMeta;
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCustomerDto): Promise<Customer> {
    return this.prisma.client.customer.create({
      data: {
        name: dto.name,
        phone: this.normalizePhone(dto.phone),
        email: this.normalizeEmail(dto.email),
        address: dto.address ?? null,
        city: dto.city ?? null,
        postalCode: dto.postalCode ?? null,
        notes: dto.notes ?? null,
      },
    });
  }

  async findAll(query: QueryCustomersDto): Promise<PaginatedCustomers> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const search = query.search || undefined;

    const conditions: Prisma.CustomerWhereInput[] = [];

    if (search) {
      const searchConditions: Prisma.CustomerWhereInput[] = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];

      if (isPhoneLike(search)) {
        const phoneTerm = normalizePhone(search);

        if (phoneTerm) {
          searchConditions.push({ phone: { contains: phoneTerm } });
        }
      }

      conditions.push({ OR: searchConditions });
    }

    const where: Prisma.CustomerWhereInput =
      conditions.length > 0 ? { AND: conditions } : {};

    const [data, total] = await Promise.all([
      this.prisma.client.customer.findMany({
        where,
        orderBy: this.buildOrderBy(query),
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.customer.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<Customer> {
    const customer = await this.prisma.client.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<Customer> {
    const existing = await this.prisma.client.customer.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Customer not found');
    }

    const data: Prisma.CustomerUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name;
    }

    if (dto.phone !== undefined) {
      data.phone = this.normalizePhone(dto.phone);
    }

    if (dto.email !== undefined) {
      data.email = this.normalizeEmail(dto.email);
    }

    if (dto.address !== undefined) {
      data.address = dto.address;
    }

    if (dto.city !== undefined) {
      data.city = dto.city;
    }

    if (dto.postalCode !== undefined) {
      data.postalCode = dto.postalCode;
    }

    if (dto.notes !== undefined) {
      data.notes = dto.notes;
    }

    if (Object.keys(data).length === 0) {
      return existing;
    }

    return this.prisma.client.customer.update({ where: { id }, data });
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.client.customer.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Customer not found');
    }

    try {
      await this.prisma.client.customer.delete({ where: { id } });
    } catch (error) {
      throw this.mapReferencedViolation(error);
    }
  }

  private buildOrderBy(
    query: QueryCustomersDto,
  ): Prisma.CustomerOrderByWithRelationInput {
    const field = query.sortBy ?? 'createdAt';
    const order = query.sortOrder ?? (field === 'name' ? 'asc' : 'desc');

    switch (field) {
      case 'name':
        return { name: order };
      case 'updatedAt':
        return { updatedAt: order };
      default:
        return { createdAt: order };
    }
  }

  private normalizePhone(raw: string): string {
    const phone = normalizePhone(raw);

    if (!PHONE_PATTERN.test(phone)) {
      throw new BadRequestException(PHONE_INVALID_MESSAGE);
    }

    return phone;
  }

  private normalizeEmail(email: string | null | undefined): string | null {
    return email ? email.trim().toLowerCase() : null;
  }

  private mapReferencedViolation(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2003' || error.code === 'P2014')
    ) {
      return new ConflictException(
        'Customer cannot be deleted because it is still referenced by other records',
      );
    }

    return error;
  }
}
