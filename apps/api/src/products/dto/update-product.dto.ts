import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { MAX_SLUG_LENGTH } from '../../common/utils/slug.util.js';
import {
  MAX_PRICE_DECIMAL_PLACES,
  MAX_WEIGHT_DECIMAL_PLACES,
  PRODUCT_DESCRIPTION_MAX_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_SHORT_DESCRIPTION_MAX_LENGTH,
  PRODUCT_SKU_MAX_LENGTH,
  PRODUCT_UNIT_MAX_LENGTH,
} from './create-product.dto.js';

export class UpdateProductDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(PRODUCT_NAME_MAX_LENGTH)
  name?: string;

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
  description?: string | null;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(PRODUCT_SHORT_DESCRIPTION_MAX_LENGTH)
  shortDescription?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(PRODUCT_SKU_MAX_LENGTH)
  sku?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsUUID()
  brandId?: string | null;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(PRODUCT_UNIT_MAX_LENGTH)
  unit?: string | null;

  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: MAX_PRICE_DECIMAL_PLACES })
  @Min(0)
  sellingPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: MAX_PRICE_DECIMAL_PLACES })
  @Min(0)
  compareAtPrice?: number | null;

  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lowStockThreshold?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: MAX_WEIGHT_DECIMAL_PLACES })
  @Min(0)
  weight?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: MAX_PRICE_DECIMAL_PLACES })
  @Min(0)
  length?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: MAX_PRICE_DECIMAL_PLACES })
  @Min(0)
  width?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: MAX_PRICE_DECIMAL_PLACES })
  @Min(0)
  height?: number | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
