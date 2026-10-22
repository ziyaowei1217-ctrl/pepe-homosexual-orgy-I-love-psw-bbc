import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
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

import { roommateCodes } from "../roommates/roommate-values";

const profileRoles = ["renter", "lister", "both"] as const;
const roommateStatuses = ["active", "hidden", "matched"] as const;

const maxShortTextLength = 140;
const maxLongTextLength = 1000;
const maxPrice = 100_000;
const maxArrayItems = 12;
const maxRoommateAge = 80;

function Trim() {
  return Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
}

/** Optional, but null is rejected because the column is not nullable. */
function NotNull() {
  return ValidateIf((_object, value) => value !== undefined);
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

  @NotNull()
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

  @NotNull()
  @TrimStringArray()
  @IsArray()
  @ArrayMaxSize(maxArrayItems)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(maxShortTextLength, { each: true })
  preferredNeighborhoods?: string[];

  @IsOptional()
  @IsIn(roommateCodes("roomType"))
  roomType?: string;

  @IsOptional()
  @IsIn(roommateCodes("cleanliness"))
  cleanliness?: string;

  @IsOptional()
  @IsIn(roommateCodes("sleepSchedule"))
  sleepSchedule?: string;

  @IsOptional()
  @IsIn(roommateCodes("smoking"))
  smoking?: string;

  @IsOptional()
  @IsIn(roommateCodes("pets"))
  pets?: string;

  @IsOptional()
  @IsIn(roommateCodes("guests"))
  guests?: string;

  @IsOptional()
  @IsIn(roommateCodes("gender"))
  gender?: string;

  @NotNull()
  @IsIn(roommateCodes("genderPreference"))
  genderPreference?: string;

  @NotNull()
  @IsArray()
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsIn(roommateCodes("dealbreakers"), { each: true })
  dealbreakers?: string[];

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
