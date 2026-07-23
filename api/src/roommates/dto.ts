import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  registerDecorator,
  ValidationArguments,
  ValidationOptions
} from "class-validator";

const editableRoommateProfileFields = [
  "name",
  "age",
  "role",
  "image",
  "match",
  "budget",
  "commute",
  "tags",
  "status"
] as const;

const roommateProfileStatuses = ["active", "hidden"] as const;

type EditableRoommateProfileField = (typeof editableRoommateProfileFields)[number];

function HasAtLeastOneEditableRoommateProfileField(validationOptions?: ValidationOptions) {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: "hasAtLeastOneEditableRoommateProfileField",
      target: target.constructor,
      propertyName,
      constraints: [editableRoommateProfileFields],
      options: validationOptions,
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          const [editableFields] = args.constraints as [readonly EditableRoommateProfileField[]];
          const dto = args.object as Record<string, unknown>;

          return editableFields.some((field) => dto[field] !== undefined);
        }
      }
    });
  };
}

export const RoommateActionEnum = {
  LIKE: "LIKE",
  PASS: "PASS",
  LATER: "LATER"
} as const;

export type RoommateActionDtoValue = (typeof RoommateActionEnum)[keyof typeof RoommateActionEnum];

export class RoommateActionDto {
  @IsEnum(RoommateActionEnum)
  action!: RoommateActionDtoValue;
}

export class RoommateDeckQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(80)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cursor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  budgetMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  budgetMax?: number;

  @IsOptional()
  @IsString()
  school?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  schools?: string;

  @IsOptional()
  @IsString()
  hobby?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  hobbies?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  gender?: string;

  @IsOptional()
  @IsIn(["precision", "balanced", "discovery"])
  strategy?: string;
}

export class CreateRoommateProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsInt()
  @Min(18)
  @Max(80)
  age!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  role!: string;

  @IsUrl()
  @MaxLength(300)
  image!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  match!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  budget!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(140)
  commute!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(40, { each: true })
  tags!: string[];
}

export class UpdateRoommateProfileDto {
  @HasAtLeastOneEditableRoommateProfileField({
    message: "At least one editable roommate profile field is required"
  })
  private readonly _atLeastOneEditableField?: true;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(18)
  @Max(80)
  age?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  role?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(300)
  image?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  match?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  budget?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(140)
  commute?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(roommateProfileStatuses)
  status?: string;
}
