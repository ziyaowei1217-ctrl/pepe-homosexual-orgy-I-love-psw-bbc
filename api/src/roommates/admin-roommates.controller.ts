import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards, ValidationPipe } from "@nestjs/common";

import { AdminGuard } from "../auth/admin.guard";
import { AdminStepUpGuard } from "../auth/admin-step-up.guard";
import { AuthGuard } from "../auth/auth.guard";
import { CreateRoommateProfileDto, UpdateRoommateProfileDto } from "./dto";
import { RoommatesService } from "./roommates.service";

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

@UseGuards(AuthGuard, AdminGuard)
@Controller("admin/roommates")
export class AdminRoommatesController {
  constructor(@Inject(RoommatesService) private readonly roommates: RoommatesService) {}

  @Get()
  findAll() {
    return this.roommates.findAdminProfiles();
  }

  @Post()
  @UseGuards(AdminStepUpGuard)
  create(@Body(createRoommateProfileBodyPipe) dto: CreateRoommateProfileDto) {
    return this.roommates.createAdminProfile(dto);
  }

  @Patch(":id")
  @UseGuards(AdminStepUpGuard)
  update(@Param("id") id: string, @Body(updateRoommateProfileBodyPipe) dto: UpdateRoommateProfileDto) {
    return this.roommates.updateAdminProfile(id, dto);
  }

  @Post(":id/archive")
  @UseGuards(AdminStepUpGuard)
  archive(@Param("id") id: string) {
    return this.roommates.updateAdminProfile(id, { status: "hidden" });
  }
}
