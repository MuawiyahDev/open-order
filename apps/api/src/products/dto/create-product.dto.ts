import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_SLUG_LENGTH } from '../../common/utils/slug.util.js';

export const PRODUCT_NAME_MAX_LENGTH = 200;
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 5000;
export const PRODUCT_SHORT_DESCRIPTION_MAX_LENGTH = 300;
export const PRODUCT_SKU_MAX_LENGTH = 64;
export const PRODUCT_UNIT_MAX_LENGTH = 50;
export const MAX_PRICE_DECIMAL_PLACES = 2;
export const MAX_WEIGHT_DECIMAL_PLACES = 3;

export class CreateProductDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(PRODUCT_NAME_MAX_LENGTH)
  name!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_SLUG_LENGTH)
  slug?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(PRODUCT_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(PRODUCT_SHORT_DESCRIPTION_MAX_LENGTH)
  shortDescription?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(PRODUCT_SKU_MAX_LENGTH)
  sku?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsUUID()
  categoryId!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(PRODUCT_UNIT_MAX_LENGTH)
  unit?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: MAX_PRICE_DECIMAL_PLACES })
  @Min(0)
  sellingPrice!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: MAX_PRICE_DECIMAL_PLACES })
  @Min(0)
  compareAtPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: MAX_WEIGHT_DECIMAL_PLACES })
  @Min(0)
  weight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: MAX_PRICE_DECIMAL_PLACES })
  @Min(0)
  length?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: MAX_PRICE_DECIMAL_PLACES })
  @Min(0)
  width?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: MAX_PRICE_DECIMAL_PLACES })
  @Min(0)
  height?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayUnique()
  imageIds?: string[];
}
