import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min
} from "class-validator";

import {
  MAX_LISTING_MEDIA_BYTES,
  MAX_LISTING_MEDIA_COUNT,
  SUPPORTED_LISTING_MEDIA_MIME_TYPES,
  type SupportedListingMediaMimeType
} from "./listing-media.constants";

const sha256Pattern = /^[a-f0-9]{64}$/i;

function Trim() {
  return Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
}

export class InitializeListingMediaUploadDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  kind!: string;

  @IsIn(SUPPORTED_LISTING_MEDIA_MIME_TYPES)
  mimeType!: SupportedListingMediaMimeType;

  @IsInt()
  @Min(1)
  @Max(MAX_LISTING_MEDIA_BYTES)
  sizeBytes!: number;

  @Trim()
  @IsString()
  @Matches(sha256Pattern)
  checksumSha256!: string;
}

export class ReorderListingMediaDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_LISTING_MEDIA_COUNT)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  mediaIds!: string[];
}
