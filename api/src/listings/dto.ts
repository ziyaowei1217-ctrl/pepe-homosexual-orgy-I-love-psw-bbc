import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  registerDecorator,
  ValidationArguments,
  ValidationOptions
} from "class-validator";

const editableListingFields = [
  "title",
  "area",
  "availableFrom",
  "availableTo",
  "price",
  "originalPrice",
  "beds",
  "baths",
  "commute",
  "transit",
  "trust",
  "tags",
  "score"
] as const;

const maxPrice = 100_000;
const maxRooms = 20;
const maxShortTextLength = 140;
const maxLongTextLength = 280;
const maxTags = 12;
const maxTagLength = 40;
const maxRejectionReasonLength = 500;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

type EditableListingField = (typeof editableListingFields)[number];

function Trim() {
  return Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
}

function TrimStringArray() {
  return Transform(({ value }) =>
    Array.isArray(value) ? value.map((item) => (typeof item === "string" ? item.trim() : item)) : value
  );
}

function HasAtLeastOneEditableField(fields: readonly EditableListingField[], validationOptions?: ValidationOptions) {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: "hasAtLeastOneEditableField",
      target: target.constructor,
      propertyName,
      constraints: [fields],
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          const [editableFields] = args.constraints as [readonly EditableListingField[]];
          const dto = args.object as Record<string, unknown>;

          return editableFields.some((field) => dto[field] !== undefined);
        }
      }
    });
  };
}

export class CreateListingDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  title!: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  area!: string;

  @Trim()
  @IsString()
  @Matches(isoDatePattern)
  availableFrom!: string;

  @Trim()
  @IsString()
  @Matches(isoDatePattern)
  availableTo!: string;

  @IsInt()
  @Min(1)
  @Max(maxPrice)
  price!: number;

  @IsInt()
  @Min(1)
  @Max(maxPrice)
  originalPrice!: number;

  @IsInt()
  @Min(0)
  @Max(maxRooms)
  beds!: number;

  @IsInt()
  @Min(0)
  @Max(maxRooms)
  baths!: number;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxLongTextLength)
  commute!: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxLongTextLength)
  transit!: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxLongTextLength)
  trust!: string;

  @TrimStringArray()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(maxTags)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(maxTagLength, { each: true })
  tags!: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  score?: number;
}

export class UpdateListingDto {
  @HasAtLeastOneEditableField(editableListingFields, {
    message: "At least one editable listing field is required"
  })
  private readonly _atLeastOneEditableField?: true;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  title?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxShortTextLength)
  area?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @Matches(isoDatePattern)
  availableFrom?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @Matches(isoDatePattern)
  availableTo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(maxPrice)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(maxPrice)
  originalPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(maxRooms)
  beds?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(maxRooms)
  baths?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxLongTextLength)
  commute?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxLongTextLength)
  transit?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxLongTextLength)
  trust?: string;

  @IsOptional()
  @TrimStringArray()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(maxTags)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(maxTagLength, { each: true })
  tags?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  score?: number;
}

export class ListingDto extends CreateListingDto {}

export class ListingAvailabilityQueryDto {
  @IsOptional()
  @Trim()
  @IsString()
  @Matches(isoDatePattern)
  moveIn?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @Matches(isoDatePattern)
  moveOut?: string;
}

export class RejectListingDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(maxRejectionReasonLength)
  reason!: string;
}
