import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Category } from '@repo/database';
import { slugify } from '../common/utils/slug.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { QueryCategoriesDto } from './dto/query-categories.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

export const DEFAULT_PAGE_SIZE = 20;

const MAX_SLUG_ATTEMPTS = 25;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedCategories {
  data: Category[];
  meta: PaginationMeta;
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto): Promise<Category> {
    const slug = slugify(dto.slug ?? dto.name);

    if (!slug) {
      throw new BadRequestException(
        'Category slug must contain at least one letter or number',
      );
    }

    await this.ensureNameAvailable(dto.name);
    const finalSlug = await this.resolveCreateSlug(
      slug,
      dto.slug !== undefined,
    );

    try {
      return await this.prisma.client.category.create({
        data: {
          name: dto.name,
          slug: finalSlug,
          isActive: dto.isActive ?? true,
        },
      });
    } catch (error) {
      throw this.mapUniqueViolation(error);
    }
  }

  async findAll(query: QueryCategoriesDto): Promise<PaginatedCategories> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const search = query.search || undefined;

    const where: Prisma.CategoryWhereInput = {
      ...(search
        ? { name: { contains: search, mode: 'insensitive' as const } }
        : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.client.category.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.category.count({ where }),
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

  async findOne(id: string): Promise<Category> {
    const category = await this.prisma.client.category.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const existing = await this.prisma.client.category.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Category not found');
    }

    const data: Prisma.CategoryUpdateInput = {};

    if (dto.name !== undefined && dto.name !== existing.name) {
      await this.ensureNameAvailable(dto.name);
      data.name = dto.name;
    }

    if (dto.slug !== undefined) {
      const slug = slugify(dto.slug);

      if (!slug) {
        throw new BadRequestException(
          'Category slug must contain at least one letter or number',
        );
      }

      if (slug !== existing.slug) {
        await this.ensureSlugAvailable(slug);
        data.slug = slug;
      }
    }

    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    if (Object.keys(data).length === 0) {
      return existing;
    }

    try {
      return await this.prisma.client.category.update({ where: { id }, data });
    } catch (error) {
      throw this.mapUniqueViolation(error);
    }
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.client.category.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Category not found');
    }

    try {
      await this.prisma.client.category.delete({ where: { id } });
    } catch (error) {
      throw this.mapReferencedViolation(error);
    }
  }

  private mapReferencedViolation(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2003' || error.code === 'P2014')
    ) {
      return new ConflictException(
        'Category cannot be deleted because it is still referenced by products',
      );
    }

    return error;
  }

  private async ensureNameAvailable(name: string): Promise<void> {
    const conflict = await this.prisma.client.category.findUnique({
      where: { name },
      select: { id: true },
    });

    if (conflict) {
      throw new ConflictException('Category name already exists');
    }
  }

  private async ensureSlugAvailable(slug: string): Promise<void> {
    const conflict = await this.prisma.client.category.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (conflict) {
      throw new ConflictException('Category slug already exists');
    }
  }

  private async resolveCreateSlug(
    slug: string,
    isExplicit: boolean,
  ): Promise<string> {
    const conflict = await this.prisma.client.category.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!conflict) {
      return slug;
    }

    if (isExplicit) {
      throw new ConflictException('Category slug already exists');
    }

    for (let suffix = 2; suffix <= MAX_SLUG_ATTEMPTS + 1; suffix += 1) {
      const candidate = `${slug}-${suffix}`;
      const taken = await this.prisma.client.category.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });

      if (!taken) {
        return candidate;
      }
    }

    throw new ConflictException(
      'Unable to generate a unique slug; please provide a custom slug',
    );
  }

  private mapUniqueViolation(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException('Category name or slug already exists');
    }

    return error;
  }
}
