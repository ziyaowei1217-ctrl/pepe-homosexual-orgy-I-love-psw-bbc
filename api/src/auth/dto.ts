import { IsEmail, IsString, Length } from "class-validator";

export class EmailCodeDto {
  @IsEmail()
  email!: string;
}

export class VerifyEmailDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}
