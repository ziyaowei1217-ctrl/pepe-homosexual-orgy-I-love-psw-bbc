import { IsArray, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

export class ListingDto {
  @IsString()
  title!: string;

  @IsString()
  area!: string;

  @IsString()
  image!: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsNumber()
  @Min(0)
  originalPrice!: number;

  @IsNumber()
  @Min(0)
  beds!: number;

  @IsNumber()
  @Min(0)
  baths!: number;

  @IsString()
  commute!: string;

  @IsString()
  transit!: string;

  @IsString()
  trust!: string;

  @IsArray()
  @IsString({ each: true })
  tags!: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  score?: number;
}

export class RejectListingDto {
  @IsString()
  reason!: string;
}
