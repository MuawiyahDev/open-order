import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@repo/database';
import { slugify } from '../common/utils/slug.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { QueryProductsDto } from './dto/query-products.dto.js';
import { SetProductImagesDto } from './dto/set-product-images.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

export const DEFAULT_PAGE_SIZE = 20;

const MAX_SLUG_ATTEMPTS = 25;

const IMAGE_API_ROUTE = '/api/images';

const PRODUCT_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  brand: { select: { id: true, name: true, slug: true } },
  images: {
    include: { image: true },
    orderBy: { sortOrder: 'asc' as const },
  },
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: typeof PRODUCT_INCLUDE;
}>;

export interface ProductRelationSummary {
  id: string;
  name: string;
  slug: string;
}

export interface ProductImageItemResponse {
  id: string;
  sortOrder: number;
  isPrimary: boolean;
  image: {
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
    width: number | null;
    height: number | null;
    altText: string | null;
    url: string;
  };
}

export interface ProductResponse {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  sku: string | null;
  category: ProductRelationSummary;
  brand: ProductRelationSummary | null;
  unit: string | null;
  sellingPrice: string;
  compareAtPrice: string | null;
  stockQuantity: number;
  lowStockThreshold: number | null;
  weight: string | null;
  length: string | null;
  width: string | null;
  height: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  images: ProductImageItemResponse[];
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedProducts {
  data: ProductResponse[];
  meta: PaginationMeta;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProductDto): Promise<ProductResponse> {
    const slug = slugify(dto.slug ?? dto.name);

    if (!slug) {
      throw new BadRequestException(
        'Product slug must contain at least one letter or number',
      );
    }

    await this.ensureCategoryExists(dto.categoryId);

    if (dto.brandId) {
      await this.ensureBrandExists(dto.brandId);
    }

    const imageIds = dto.imageIds ?? [];

    if (imageIds.length > 0) {
      await this.ensureImagesExist(imageIds);
    }

    if (dto.sku) {
      await this.ensureSkuAvailable(dto.sku);
    }

    const finalSlug = await this.resolveCreateSlug(slug, dto.slug !== undefined);

    try {
      const product = await this.prisma.client.$transaction(async (tx) =>
        tx.product.create({
          data: {
            name: dto.name,
            slug: finalSlug,
            description: dto.description ?? null,
            shortDescription: dto.shortDescription ?? null,
            sku: dto.sku ?? null,
            categoryId: dto.categoryId,
            brandId: dto.brandId ?? null,
            unit: dto.unit ?? null,
            sellingPrice: dto.sellingPrice,
            compareAtPrice: dto.compareAtPrice ?? null,
            stockQuantity: dto.stockQuantity ?? 0,
            lowStockThreshold: dto.lowStockThreshold ?? null,
            weight: dto.weight ?? null,
            length: dto.length ?? null,
            width: dto.width ?? null,
            height: dto.height ?? null,
            isActive: dto.isActive ?? true,
            ...(imageIds.length > 0
              ? {
                  images: {
                    create: imageIds.map((imageId, index) => ({
                      imageId,
                      sortOrder: index,
                      isPrimary: index === 0,
                    })),
                  },
                }
              : {}),
          },
          include: PRODUCT_INCLUDE,
        }),
      );

      return this.toResponse(product);
    } catch (error) {
      throw this.mapKnownErrors(error);
    }
  }

  async findAll(query: QueryProductsDto): Promise<PaginatedProducts> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const search = query.search || undefined;

    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    ) {
      throw new BadRequestException(
        'minPrice must be less than or equal to maxPrice',
      );
    }

    const conditions: Prisma.ProductWhereInput[] = [];

    if (search) {
      conditions.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { slug: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    if (query.lowStock === true) {
      conditions.push({
        lowStockThreshold: { not: null },
        stockQuantity: { lte: this.prisma.client.product.fields.lowStockThreshold },
      });
    } else if (query.lowStock === false) {
      conditions.push({
        OR: [
          { lowStockThreshold: null },
          {
            stockQuantity: {
              gt: this.prisma.client.product.fields.lowStockThreshold,
            },
          },
        ],
      });
    }

    const where: Prisma.ProductWhereInput = {
      ...(conditions.length > 0 ? { AND: conditions } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.minPrice !== undefined || query.maxPrice !== undefined
        ? {
            sellingPrice: {
              ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
              ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.client.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: this.buildOrderBy(query),
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.product.count({ where }),
    ]);

    return {
      data: data.map((product) => this.toResponse(product)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<ProductResponse> {
    const product = await this.prisma.client.product.findUnique({
      where: { id },
      include: PRODUCT_INCLUDE,
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.toResponse(product);
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductResponse> {
    const existing = await this.prisma.client.product.findUnique({
      where: { id },
      include: PRODUCT_INCLUDE,
    });

    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    const data: Prisma.ProductUpdateInput = {};

    if (dto.name !== undefined && dto.name !== existing.name) {
      data.name = dto.name;
    }

    if (dto.slug !== undefined) {
      const slug = slugify(dto.slug);

      if (!slug) {
        throw new BadRequestException(
          'Product slug must contain at least one letter or number',
        );
      }

      if (slug !== existing.slug) {
        await this.ensureSlugAvailable(slug);
        data.slug = slug;
      }
    }

    if (dto.description !== undefined) {
      data.description = dto.description;
    }

    if (dto.shortDescription !== undefined) {
      data.shortDescription = dto.shortDescription;
    }

    if (dto.sku !== undefined && dto.sku !== existing.sku) {
      if (dto.sku !== null) {
        await this.ensureSkuAvailable(dto.sku);
      }

      data.sku = dto.sku;
    }

    if (dto.categoryId !== undefined && dto.categoryId !== existing.categoryId) {
      await this.ensureCategoryExists(dto.categoryId);
      data.category = { connect: { id: dto.categoryId } };
    }

    if (dto.brandId !== undefined && dto.brandId !== existing.brandId) {
      if (dto.brandId !== null) {
        await this.ensureBrandExists(dto.brandId);
        data.brand = { connect: { id: dto.brandId } };
      } else {
        data.brand = { disconnect: true };
      }
    }

    if (dto.unit !== undefined) {
      data.unit = dto.unit;
    }

    if (dto.sellingPrice !== undefined) {
      data.sellingPrice = dto.sellingPrice;
    }

    if (dto.compareAtPrice !== undefined) {
      data.compareAtPrice = dto.compareAtPrice;
    }

    if (dto.stockQuantity !== undefined) {
      data.stockQuantity = dto.stockQuantity;
    }

    if (dto.lowStockThreshold !== undefined) {
      data.lowStockThreshold = dto.lowStockThreshold;
    }

    if (dto.weight !== undefined) {
      data.weight = dto.weight;
    }

    if (dto.length !== undefined) {
      data.length = dto.length;
    }

    if (dto.width !== undefined) {
      data.width = dto.width;
    }

    if (dto.height !== undefined) {
      data.height = dto.height;
    }

    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    if (Object.keys(data).length === 0) {
      return this.toResponse(existing);
    }

    try {
      const updated = await this.prisma.client.product.update({
        where: { id },
        data,
        include: PRODUCT_INCLUDE,
      });

      return this.toResponse(updated);
    } catch (error) {
      throw this.mapKnownErrors(error);
    }
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.client.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    try {
      await this.prisma.client.product.delete({ where: { id } });
    } catch (error) {
      throw this.mapReferencedViolation(error);
    }
  }

  async replaceImages(
    id: string,
    dto: SetProductImagesDto,
  ): Promise<ProductResponse> {
    const existing = await this.prisma.client.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    if (dto.imageIds.length > 0) {
      await this.ensureImagesExist(dto.imageIds);
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.productImage.deleteMany({ where: { productId: id } });

      if (dto.imageIds.length > 0) {
        await tx.productImage.createMany({
          data: dto.imageIds.map((imageId, index) => ({
            productId: id,
            imageId,
            sortOrder: index,
            isPrimary: index === 0,
          })),
        });
      }
    });

    return this.findOne(id);
  }

  async removeImage(id: string, imageId: string): Promise<void> {
    const existing = await this.prisma.client.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    const association = await this.prisma.client.productImage.findUnique({
      where: { productId_imageId: { productId: id, imageId } },
      select: { id: true, isPrimary: true },
    });

    if (!association) {
      throw new NotFoundException('Image is not associated with this product');
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.productImage.delete({ where: { id: association.id } });

      if (association.isPrimary) {
        const next = await tx.productImage.findFirst({
          where: { productId: id },
          orderBy: { sortOrder: 'asc' },
          select: { id: true },
        });

        if (next) {
          await tx.productImage.update({
            where: { id: next.id },
            data: { isPrimary: true },
          });
        }
      }
    });
  }

  private buildOrderBy(
    query: QueryProductsDto,
  ): Prisma.ProductOrderByWithRelationInput {
    const field = query.sortBy ?? 'createdAt';
    const order =
      query.sortOrder ??
      (field === 'name' || field === 'stockQuantity' ? 'asc' : 'desc');

    switch (field) {
      case 'name':
        return { name: order };
      case 'sellingPrice':
        return { sellingPrice: order };
      case 'stockQuantity':
        return { stockQuantity: order };
      case 'updatedAt':
        return { updatedAt: order };
      default:
        return { createdAt: order };
    }
  }

  private async ensureCategoryExists(categoryId: string): Promise<void> {
    const category = await this.prisma.client.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }
  }

  private async ensureBrandExists(brandId: string): Promise<void> {
    const brand = await this.prisma.client.brand.findUnique({
      where: { id: brandId },
      select: { id: true },
    });

    if (!brand) {
      throw new NotFoundException('Brand not found');
    }
  }

  private async ensureImagesExist(imageIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(imageIds)];
    const images = await this.prisma.client.image.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });

    if (images.length !== uniqueIds.length) {
      throw new NotFoundException('One or more images not found');
    }
  }

  private async ensureSkuAvailable(sku: string): Promise<void> {
    const conflict = await this.prisma.client.product.findUnique({
      where: { sku },
      select: { id: true },
    });

    if (conflict) {
      throw new ConflictException('Product SKU already exists');
    }
  }

  private async ensureSlugAvailable(slug: string): Promise<void> {
    const conflict = await this.prisma.client.product.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (conflict) {
      throw new ConflictException('Product slug already exists');
    }
  }

  private async resolveCreateSlug(
    slug: string,
    isExplicit: boolean,
  ): Promise<string> {
    const conflict = await this.prisma.client.product.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!conflict) {
      return slug;
    }

    if (isExplicit) {
      throw new ConflictException('Product slug already exists');
    }

    for (let suffix = 2; suffix <= MAX_SLUG_ATTEMPTS + 1; suffix += 1) {
      const candidate = `${slug}-${suffix}`;
      const taken = await this.prisma.client.product.findUnique({
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

  private mapKnownErrors(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return new ConflictException('Product slug or SKU already exists');
      }

      if (error.code === 'P2003' || error.code === 'P2014') {
        return new NotFoundException('A referenced record no longer exists');
      }
    }

    return error;
  }

  private mapReferencedViolation(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2003' || error.code === 'P2014')
    ) {
      return new ConflictException(
        'Product cannot be deleted because it is still referenced by other records',
      );
    }

    return error;
  }

  private toResponse(product: ProductWithRelations): ProductResponse {
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      shortDescription: product.shortDescription,
      sku: product.sku,
      category: product.category,
      brand: product.brand,
      unit: product.unit,
      sellingPrice: product.sellingPrice.toString(),
      compareAtPrice: product.compareAtPrice?.toString() ?? null,
      stockQuantity: product.stockQuantity,
      lowStockThreshold: product.lowStockThreshold,
      weight: product.weight?.toString() ?? null,
      length: product.length?.toString() ?? null,
      width: product.width?.toString() ?? null,
      height: product.height?.toString() ?? null,
      isActive: product.isActive,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      images: product.images.map((association) => ({
        id: association.id,
        sortOrder: association.sortOrder,
        isPrimary: association.isPrimary,
        image: {
          id: association.image.id,
          originalName: association.image.originalName,
          mimeType: association.image.mimeType,
          size: association.image.size,
          width: association.image.width,
          height: association.image.height,
          altText: association.image.altText,
          url: `${IMAGE_API_ROUTE}/${association.image.id}/file`,
        },
      })),
    };
  }
}
