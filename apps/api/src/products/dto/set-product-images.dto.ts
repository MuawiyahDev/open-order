import {
  ArrayUnique,
  IsArray,
  IsUUID,
} from 'class-validator';

export class SetProductImagesDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayUnique()
  imageIds!: string[];
}
