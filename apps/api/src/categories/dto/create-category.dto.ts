import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { MAX_SLUG_LENGTH } from '../../common/utils/slug.util.js';

export const CATEGORY_NAME_MAX_LENGTH = 100;

export class CreateCategoryDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(CATEGORY_NAME_MAX_LENGTH)
  name!: string;

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
