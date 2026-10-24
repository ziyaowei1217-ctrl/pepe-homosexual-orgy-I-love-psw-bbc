import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsString, Length, Matches, MaxLength } from "class-validator";

function Trim() {
  return Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
}

export class EmailCodeDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email!: string;
}

export class VerifyEmailDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @Trim()
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}

export class AdminStepUpCodeDto {
  @Trim()
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}

export class NeonTokenExchangeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(8192)
  token!: string;
}

export class PhoneNumberDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phoneNumber!: string;
}

export class PhoneCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phoneNumber!: string;

  @Trim()
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}
