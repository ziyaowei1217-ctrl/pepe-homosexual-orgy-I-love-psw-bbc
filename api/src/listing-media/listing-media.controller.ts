import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
  ValidationPipe
} from "@nestjs/common";

import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { AdminGuard } from "../auth/admin.guard";
import {
  InitializeListingMediaUploadDto,
  ListingMediaUploadAttemptDto,
  ReorderListingMediaDto
} from "./listing-media.dto";
import { presentListingMedia } from "./listing-media.presentation";
import { ListingMediaService } from "./listing-media.service";

const initializeUploadPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  expectedType: InitializeListingMediaUploadDto
});

const reorderMediaPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  expectedType: ReorderListingMediaDto
});

const uploadAttemptPipe = new ValidationPipe({
  whitelist: true, forbidNonWhitelisted: true, transform: true, expectedType: ListingMediaUploadAttemptDto
});

type BinaryResponse = {
  setHeader(name: string, value: string): void;
  send(body: Buffer): unknown;
};

@UseGuards(AuthGuard)
@Controller("listings/:listingId/media")
export class ListingMediaController {
  constructor(@Inject(ListingMediaService) private readonly media: ListingMediaService) {}

  @Post("uploads")
  async initializeUpload(
    @Req() request: AuthenticatedRequest,
    @Param("listingId") listingId: string,
    @Body(initializeUploadPipe) input: InitializeListingMediaUploadDto
  ) {
    const result = await this.media.initializeUpload(request.user.id, listingId, input);
    return { ...result, media: presentListingMedia(result.media) };
  }

  @Get()
  async findOwned(@Req() request: AuthenticatedRequest, @Param("listingId") listingId: string) {
    const media = await this.media.findOwned(request.user.id, listingId);
    return media.map((item) => ({ ...presentListingMedia(item), initializationCommandId: item.initializationReceipt?.commandId }));
  }

  @Post(":mediaId/finalize")
  async finalize(
    @Req() request: AuthenticatedRequest,
    @Param("listingId") listingId: string,
    @Param("mediaId") mediaId: string,
    @Body(uploadAttemptPipe) input: ListingMediaUploadAttemptDto
  ) {
    return presentListingMedia(await this.media.finalize(request.user.id, listingId, mediaId, input.uploadAttemptId));
  }

  @Post(":mediaId/retry")
  async retry(
    @Req() request: AuthenticatedRequest,
    @Param("listingId") listingId: string,
    @Param("mediaId") mediaId: string,
    @Body(uploadAttemptPipe) input: ListingMediaUploadAttemptDto
  ) {
    const result = await this.media.retry(request.user.id, listingId, mediaId, input.uploadAttemptId);
    return { ...result, media: presentListingMedia(result.media) };
  }

  @Patch("order")
  async reorder(
    @Req() request: AuthenticatedRequest,
    @Param("listingId") listingId: string,
    @Body(reorderMediaPipe) input: ReorderListingMediaDto
  ) {
    const media = await this.media.reorder(request.user.id, listingId, input);
    return media.map(presentListingMedia);
  }

  @Delete(":mediaId")
  remove(
    @Req() request: AuthenticatedRequest,
    @Param("listingId") listingId: string,
    @Param("mediaId") mediaId: string
  ) {
    return this.media.remove(request.user.id, listingId, mediaId);
  }
}

@Controller("listing-media")
export class PublicListingMediaController {
  constructor(@Inject(ListingMediaService) private readonly media: ListingMediaService) {}

  @Get(":mediaId/content")
  async content(@Param("mediaId") mediaId: string, @Res() response: BinaryResponse) {
    const content = await this.media.readPublished(mediaId);
    response.setHeader("Content-Type", content.mimeType);
    response.setHeader("Content-Length", String(content.bytes.length));
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return response.send(content.bytes);
  }
}

@UseGuards(AuthGuard, AdminGuard)
@Controller("admin/listings/:listingId/media")
export class AdminListingMediaController {
  constructor(@Inject(ListingMediaService) private readonly media: ListingMediaService) {}

  @Get(":mediaId/content")
  async content(
    @Param("listingId") listingId: string,
    @Param("mediaId") mediaId: string,
    @Res() response: BinaryResponse
  ) {
    const content = await this.media.readForReview(listingId, mediaId);
    response.setHeader("Content-Type", content.mimeType);
    response.setHeader("Content-Length", String(content.bytes.length));
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return response.send(content.bytes);
  }
}
