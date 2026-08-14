import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { getListingMediaStorageConfig } from "../config/env";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import {
  ListingMediaController,
  PublicListingMediaController
} from "./listing-media.controller";
import { ListingMediaService } from "./listing-media.service";
import {
  LISTING_MEDIA_STORAGE,
  S3CompatibleListingMediaStorage,
  type ListingMediaStorage
} from "./listing-media-storage";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ListingMediaController, PublicListingMediaController],
  providers: [
    {
      provide: LISTING_MEDIA_STORAGE,
      useFactory: () => new S3CompatibleListingMediaStorage(getListingMediaStorageConfig())
    },
    {
      provide: ListingMediaService,
      inject: [PrismaService, LISTING_MEDIA_STORAGE],
      useFactory: (prisma: PrismaService, storage: ListingMediaStorage) =>
        new ListingMediaService(prisma, storage)
    }
  ],
  exports: [ListingMediaService]
})
export class ListingMediaModule {}
