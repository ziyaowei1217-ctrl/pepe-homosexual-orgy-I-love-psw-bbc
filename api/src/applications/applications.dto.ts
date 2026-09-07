import { GuarantorStatus, RentalApplicationScope, RentalIncomeBand } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateIf } from "class-validator";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function Trim() {
  return Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
}

export class CreateRentalApplicationDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  listingId!: string;

  @IsEnum(RentalApplicationScope)
  scope!: RentalApplicationScope;

  @ValidateIf((value: CreateRentalApplicationDto) => value.scope === RentalApplicationScope.TEAM || value.teamId !== undefined)
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  teamId?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(140)
  contactName?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @IsEmail()
  @MaxLength(254)
  contactEmail?: string | null;

  @Trim()
  @IsString()
  @Matches(isoDatePattern)
  moveIn!: string;

  @Trim()
  @IsString()
  @Matches(isoDatePattern)
  moveOut!: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(140)
  schoolOrOccupation!: string;

  @IsEnum(RentalIncomeBand)
  incomeBand!: RentalIncomeBand;

  @IsEnum(GuarantorStatus)
  guarantorStatus!: GuarantorStatus;

  @Trim()
  @IsString()
  @MaxLength(1000)
  note!: string;
}

export class ApplicationDecisionDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason?: string;
}

export class CancelRentalApplicationDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
