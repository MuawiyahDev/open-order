import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export const IMAGE_ALT_TEXT_MAX_LENGTH = 500;

export class CreateImageDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(IMAGE_ALT_TEXT_MAX_LENGTH)
  altText?: string;
}
