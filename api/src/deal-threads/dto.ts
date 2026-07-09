import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from "class-validator";

export const ViewingModeDtoEnum = {
  IN_PERSON: "in-person",
  VIDEO: "video"
} as const;

export type ViewingModeDtoValue = (typeof ViewingModeDtoEnum)[keyof typeof ViewingModeDtoEnum];

function Trim() {
  return Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
}

function TrimStringArray() {
  return Transform(({ value }) =>
    Array.isArray(value) ? value.map((item) => (typeof item === "string" ? item.trim() : item)) : value
  );
}

export class CreateDealThreadDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  listingId!: string;

  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  listingTitle!: string;

  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  area!: string;

  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  contactName!: string;

  @IsOptional()
  @TrimStringArray()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(80, { each: true })
  participantNames?: string[];

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(120)
  dealRoomId?: string;
}

export class SendDealMessageDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body!: string;
}

export class CreateViewingRequestDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  timeLabel!: string;

  @Trim()
  @IsISO8601()
  iso!: string;

  @IsEnum(ViewingModeDtoEnum)
  mode!: ViewingModeDtoValue;

  @TrimStringArray()
  @IsArray()
  @ArrayMaxSize(8)
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(80, { each: true })
  participantNames!: string[];
}
