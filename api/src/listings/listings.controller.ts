import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";

import { AuthGuard, AuthenticatedRequest } from "../auth/auth.guard";
import { ListingDto } from "./dto";
import { ListingsService } from "./listings.service";

@Controller("listings")
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get()
  findAll() {
    return this.listings.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.listings.findOne(id);
  }

  @UseGuards(AuthGuard)
  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: ListingDto) {
    return this.listings.create(request.user.id, dto);
  }

  @UseGuards(AuthGuard)
  @Patch(":id")
  update(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() dto: Partial<ListingDto>) {
    return this.listings.update(request.user.id, id, dto);
  }
}
