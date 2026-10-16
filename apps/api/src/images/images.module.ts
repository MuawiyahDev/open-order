import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { IMAGE_STORAGE } from '../storage/image-storage.js';
import { LocalImageStorage } from '../storage/local-image-storage.js';
import { ImagesController } from './images.controller.js';
import { ImagesService } from './images.service.js';
import { IMAGE_MAX_FILE_SIZE, resolveImageMaxFileSize } from './images.constants.js';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: {
          fileSize: resolveImageMaxFileSize(config),
          files: 1,
        },
      }),
    }),
  ],
  controllers: [ImagesController],
  providers: [
    ImagesService,
    LocalImageStorage,
    { provide: IMAGE_STORAGE, useExisting: LocalImageStorage },
    {
      provide: IMAGE_MAX_FILE_SIZE,
      useFactory: resolveImageMaxFileSize,
      inject: [ConfigService],
    },
  ],
})
export class ImagesModule {}
