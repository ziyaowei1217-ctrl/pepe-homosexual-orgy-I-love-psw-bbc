import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateIf
} from "class-validator";

const profileRoles = ["renter", "lister", "both"] as const;
const roomTypes = ["private_room", "shared_room", "entire_place"] as const;
const roommateStatuses = ["active", "hidden", "matched"] as const;

const maxShortTextLength = 140;
const maxLongTextLength = 1000;
const maxPrice = 100_000;
const maxArrayItems = 12;
const maxRoommateAge = 80;

function Trim() {
  return Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
}

function TrimStringArray() {
  return Transform(({ value }) =>
    Array.isArray(value) ? value.map((item) => (typeof item === "string" ? item.trim() : item)) : value
  );
}

export class UpdateProfileDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  displayName?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @IsUrl()
  @MaxLength(500)
  avatarUrl?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  school?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  city?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(profileRoles)
  role?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  wechat?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  instagram?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxLongTextLength)
  bio?: string | null;
}

class RoommateProfileFieldsDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  school?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  city?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(maxPrice)
  budgetMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(maxPrice)
  budgetMax?: number;

  @IsOptional()
  @IsDateString()
  moveInDate?: string;

  @IsOptional()
  @IsDateString()
  moveOutDate?: string;

  @IsOptional()
  @TrimStringArray()
  @IsArray()
  @ArrayMaxSize(maxArrayItems)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(maxShortTextLength, { each: true })
  preferredNeighborhoods?: string[];

  @IsOptional()
  @IsIn(roomTypes)
  roomType?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  cleanliness?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  sleepSchedule?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  smoking?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  pets?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  guests?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxLongTextLength)
  intro?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxLongTextLength)
  lookingFor?: string;
}

export class CreateRoommateProfileDto extends RoommateProfileFieldsDto {
  @IsDefined()
  @IsInt()
  @Min(18)
  @Max(maxRoommateAge)
  age!: number;
}

export class UpdateRoommateProfileDto extends RoommateProfileFieldsDto {
  @IsOptional()
  @IsInt()
  @Min(18)
  @Max(maxRoommateAge)
  age?: number;

  @IsOptional()
  @IsIn(roommateStatuses)
  status?: string;
}
