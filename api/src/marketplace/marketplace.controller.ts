import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req, UseGuards, ValidationPipe } from "@nestjs/common";

import { AuthGuard, AuthenticatedRequest } from "../auth/auth.guard";
import {
  CreateHousingListingDto,
  CreateRoommateProfileDto,
  UpdateHousingListingDto,
  UpdateProfileDto,
  UpdateRoommateProfileDto
} from "./dto";
import { MarketplaceService } from "./marketplace.service";

const updateProfileBodyPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  expectedType: UpdateProfileDto
});

const createRoommateProfileBodyPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  expectedType: CreateRoommateProfileDto
});

const updateRoommateProfileBodyPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  expectedType: UpdateRoommateProfileDto
});

const createHousingListingBodyPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  expectedType: CreateHousingListingDto
});

const updateHousingListingBodyPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  expectedType: UpdateHousingListingDto
});

@Controller("profiles")
export class ProfilesController {
  constructor(@Inject(MarketplaceService) private readonly marketplace: MarketplaceService) {}

  @UseGuards(AuthGuard)
  @Get("me")
  getMe(@Req() request: AuthenticatedRequest) {
    return this.marketplace.getMyProfile(request.user.email);
  }

  @UseGuards(AuthGuard)
  @Patch("me")
  updateMe(@Req() request: AuthenticatedRequest, @Body(updateProfileBodyPipe) dto: UpdateProfileDto) {
    return this.marketplace.updateMyProfile(request.user.email, dto);
  }
}

@Controller("roommate-profiles")
export class RoommateProfilesController {
  constructor(@Inject(MarketplaceService) private readonly marketplace: MarketplaceService) {}

  @Get()
  findAll(@Query("city") city?: string, @Query("school") school?: string) {
    return this.marketplace.findRoommateProfiles({ city, school });
  }

  @UseGuards(AuthGuard)
  @Post()
  create(@Req() request: AuthenticatedRequest, @Body(createRoommateProfileBodyPipe) dto: CreateRoommateProfileDto) {
    return this.marketplace.createRoommateProfile(request.user.email, dto);
  }

  @UseGuards(AuthGuard)
  @Patch(":id")
  update(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(updateRoommateProfileBodyPipe) dto: UpdateRoommateProfileDto
  ) {
    return this.marketplace.updateRoommateProfile(request.user.email, id, dto);
  }
}

@Controller("housing-listings")
export class HousingListingsController {
  constructor(@Inject(MarketplaceService) private readonly marketplace: MarketplaceService) {}

  @Get()
  findAll(
    @Query("city") city?: string,
    @Query("schoolNearby") schoolNearby?: string,
    @Query("neighborhood") neighborhood?: string
  ) {
    return this.marketplace.findHousingListings({ city, schoolNearby, neighborhood });
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.marketplace.findHousingListing(id);
  }

  @UseGuards(AuthGuard)
  @Post()
  create(@Req() request: AuthenticatedRequest, @Body(createHousingListingBodyPipe) dto: CreateHousingListingDto) {
    return this.marketplace.createHousingListing(request.user.email, dto);
  }

  @UseGuards(AuthGuard)
  @Patch(":id")
  update(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(updateHousingListingBodyPipe) dto: UpdateHousingListingDto
  ) {
    return this.marketplace.updateHousingListing(request.user.email, id, dto);
  }
}
