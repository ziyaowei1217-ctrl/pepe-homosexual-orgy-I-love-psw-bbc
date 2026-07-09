import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min
} from "class-validator";

const profileRoles = ["renter", "lister", "both"] as const;
const roomTypes = ["private_room", "shared_room", "entire_place"] as const;
const roommateStatuses = ["active", "hidden", "matched"] as const;
const listingTypes = ["sublet", "lease_takeover", "roommate_needed"] as const;
const propertyTypes = ["apartment", "house", "studio"] as const;
const listingStatuses = ["draft", "active", "rented", "hidden"] as const;

const maxShortTextLength = 140;
const maxLongTextLength = 1000;
const maxPrice = 100_000;
const maxRooms = 20;
const maxArrayItems = 12;

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
  displayName?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsUrl()
  @MaxLength(500)
  avatarUrl?: string;

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
  @IsIn(profileRoles)
  role?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  wechat?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  instagram?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxLongTextLength)
  bio?: string;
}

export class CreateRoommateProfileDto {
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

export class UpdateRoommateProfileDto extends CreateRoommateProfileDto {
  @IsOptional()
  @IsIn(roommateStatuses)
  status?: string;
}

export class CreateHousingListingDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  title!: string;

  @IsIn(listingTypes)
  listingType!: string;

  @IsIn(propertyTypes)
  propertyType!: string;

  @IsIn(roomTypes)
  roomType!: string;

  @IsInt()
  @Min(1)
  @Max(maxPrice)
  priceMonthly!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(maxPrice)
  depositAmount?: number;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  city!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  neighborhood?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  schoolNearby?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  addressApprox?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @IsDateString()
  moveInDate!: string;

  @IsOptional()
  @IsDateString()
  moveOutDate?: string;

  @IsOptional()
  @IsBoolean()
  flexibleDates?: boolean;

  @IsNumber()
  @Min(0)
  @Max(maxRooms)
  bedrooms!: number;

  @IsNumber()
  @Min(0)
  @Max(maxRooms)
  bathrooms!: number;

  @IsOptional()
  @IsBoolean()
  furnished?: boolean;

  @IsOptional()
  @IsBoolean()
  utilitiesIncluded?: boolean;

  @IsOptional()
  @IsBoolean()
  laundry?: boolean;

  @IsOptional()
  @IsBoolean()
  parking?: boolean;

  @IsOptional()
  @IsBoolean()
  petsAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  leaseApproved?: boolean;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxLongTextLength)
  description?: string;

  @IsOptional()
  @TrimStringArray()
  @IsArray()
  @ArrayMaxSize(maxArrayItems)
  @IsUrl({}, { each: true })
  @MaxLength(500, { each: true })
  photoUrls?: string[];
}

class PartialCreateHousingListingDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  title?: string;

  @IsOptional()
  @IsIn(listingTypes)
  listingType?: string;

  @IsOptional()
  @IsIn(propertyTypes)
  propertyType?: string;

  @IsOptional()
  @IsIn(roomTypes)
  roomType?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(maxPrice)
  priceMonthly?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(maxPrice)
  depositAmount?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  city?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  neighborhood?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  schoolNearby?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  addressApprox?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @IsOptional()
  @IsDateString()
  moveInDate?: string;

  @IsOptional()
  @IsDateString()
  moveOutDate?: string;

  @IsOptional()
  @IsBoolean()
  flexibleDates?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(maxRooms)
  bedrooms?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(maxRooms)
  bathrooms?: number;

  @IsOptional()
  @IsBoolean()
  furnished?: boolean;

  @IsOptional()
  @IsBoolean()
  utilitiesIncluded?: boolean;

  @IsOptional()
  @IsBoolean()
  laundry?: boolean;

  @IsOptional()
  @IsBoolean()
  parking?: boolean;

  @IsOptional()
  @IsBoolean()
  petsAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  leaseApproved?: boolean;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxLongTextLength)
  description?: string;

  @IsOptional()
  @TrimStringArray()
  @IsArray()
  @ArrayMaxSize(maxArrayItems)
  @IsUrl({}, { each: true })
  @MaxLength(500, { each: true })
  photoUrls?: string[];
}

export class UpdateHousingListingDto extends PartialCreateHousingListingDto {
  @IsOptional()
  @IsIn(listingStatuses)
  status?: string;
}
