import { IsEnum } from "class-validator";

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
