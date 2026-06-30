import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsString, Length, Matches } from "class-validator";

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
