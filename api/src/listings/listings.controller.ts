import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards, ValidationPipe } from "@nestjs/common";

import { AuthGuard, AuthenticatedRequest } from "../auth/auth.guard";
import { CreateListingDto, UpdateListingDto } from "./dto";
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

@Controller("listings")
export class ListingsController {
  constructor(@Inject(ListingsService) private readonly listings: ListingsService) {}

  @Get()
  findAll() {
    return this.listings.findAll();
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
  @Patch(":id")
  update(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body(updateListingBodyPipe) dto: UpdateListingDto) {
    return this.listings.update(request.user.id, id, dto);
  }
}
