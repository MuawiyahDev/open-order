import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_PRICE_DECIMAL_PLACES } from './create-product.dto.js';

export const MAX_PAGE_SIZE = 100;

export const PRODUCT_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'sellingPrice',
  'stockQuantity',
] as const;

export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];

export const PRODUCT_SORT_ORDERS = ['asc', 'desc'] as const;

export type ProductSortOrder = (typeof PRODUCT_SORT_ORDERS)[number];

export class QueryProductsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  lowStock?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: MAX_PRICE_DECIMAL_PLACES })
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: MAX_PRICE_DECIMAL_PLACES })
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @IsIn(PRODUCT_SORT_FIELDS)
  sortBy?: ProductSortField;

  @IsOptional()
  @IsIn(PRODUCT_SORT_ORDERS)
  sortOrder?: ProductSortOrder;
}
