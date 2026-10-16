import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import { CreateImageDto } from './dto/create-image.dto.js';
import { QueryImagesDto } from './dto/query-images.dto.js';
import { ImagesService, type UploadedImageFile } from './images.service.js';

@Controller('images')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Permissions('image:create')
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  create(
    @UploadedFile() file: UploadedImageFile | undefined,
    @Body() dto: CreateImageDto,
  ) {
    return this.imagesService.create(file, dto);
  }

  @Permissions('image:read')
  @Get()
  findAll(@Query() query: QueryImagesDto) {
    return this.imagesService.findAll(query);
  }

  @Permissions('image:read')
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.imagesService.findOne(id);
  }

  @Permissions('image:read')
  @Get(':id/file')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const file = await this.imagesService.getFile(id);

    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.size),
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, max-age=86400',
    });
    res.send(file.data);
  }

  @Permissions('image:delete')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.imagesService.remove(id);
  }
}
