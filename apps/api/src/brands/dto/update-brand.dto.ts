import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { MAX_SLUG_LENGTH } from '../../common/utils/slug.util.js';
import { BRAND_NAME_MAX_LENGTH } from './create-brand.dto.js';

export class UpdateBrandDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(BRAND_NAME_MAX_LENGTH)
  name?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_SLUG_LENGTH)
  slug?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
