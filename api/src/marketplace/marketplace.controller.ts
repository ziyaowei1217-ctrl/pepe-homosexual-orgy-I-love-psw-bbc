import {
  All,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe
} from "@nestjs/common";

import { AuthGuard, AuthenticatedRequest } from "../auth/auth.guard";
import { legacyListingsRetired } from "../http/legacy-listings-retirement";
import {
  CreateRoommateProfileDto,
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
  @All()
  retiredCollection(): never {
    return legacyListingsRetired();
  }

  @All(":id")
  retiredItem(): never {
    return legacyListingsRetired();
  }
}
