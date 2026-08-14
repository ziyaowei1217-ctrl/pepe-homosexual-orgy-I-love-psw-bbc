import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req, UseGuards, ValidationPipe } from "@nestjs/common";

import { AuthGuard, AuthenticatedRequest } from "../auth/auth.guard";
import { CreateListingDto, CreateListingMediaDto, ListingAvailabilityQueryDto, UpdateListingDto } from "./dto";
import { ListingsService } from "./listings.service";

const createListingBodyPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  expectedType: CreateListingDto
});

const updateListingBodyPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  expectedType: UpdateListingDto
});

const createListingMediaBodyPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  expectedType: CreateListingMediaDto
});

const listingAvailabilityQueryPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  expectedType: ListingAvailabilityQueryDto
});

@Controller("listings")
export class ListingsController {
  constructor(@Inject(ListingsService) private readonly listings: ListingsService) {}

  @Get()
  findAll(@Query(listingAvailabilityQueryPipe) query: ListingAvailabilityQueryDto) {
    return this.listings.findAll(query);
  }

  @UseGuards(AuthGuard)
  @Get("mine")
  findMine(@Req() request: AuthenticatedRequest) {
    return this.listings.findMine(request.user.id);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.listings.findOne(id);
  }

  @UseGuards(AuthGuard)
  @Post()
  create(@Req() request: AuthenticatedRequest, @Body(createListingBodyPipe) dto: CreateListingDto) {
    return this.listings.create(request.user.id, dto);
  }

  @UseGuards(AuthGuard)
  @Post(":id/submit")
  submit(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return this.listings.submit(request.user.id, id);
  }

  @UseGuards(AuthGuard)
  @Post(":id/media")
  addMedia(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(createListingMediaBodyPipe) dto: CreateListingMediaDto
  ) {
    return this.listings.addMedia(request.user.id, id, dto);
  }

  @UseGuards(AuthGuard)
  @Patch(":id")
  update(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body(updateListingBodyPipe) dto: UpdateListingDto) {
    return this.listings.update(request.user.id, id, dto);
  }
}
