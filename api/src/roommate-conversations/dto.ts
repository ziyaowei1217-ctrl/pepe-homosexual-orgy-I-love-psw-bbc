import { BadRequestException } from "@nestjs/common";
import { Transform, Type } from "class-transformer";
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

export class SendRoommateMessageDto {
  @IsUUID()
  clientMessageId!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;
}

export class MarkRoommateConversationReadDto {
  @IsString()
  @IsNotEmpty()
  lastReadMessageId!: string;
}

export class RoommateMessagePageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cursor?: string;
}

export type RoommateMessageCursor = { createdAt: Date; id: string };

export function encodeRoommateMessageCursor(cursor: RoommateMessageCursor) {
  return Buffer.from(JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id }), "utf8").toString("base64url");
}

export function decodeRoommateMessageCursor(value: string): RoommateMessageCursor {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid base64url");
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    if (Buffer.from(decoded, "utf8").toString("base64url") !== value) throw new Error("Non-canonical cursor");
    const parsed = JSON.parse(decoded) as { createdAt?: unknown; id?: unknown };
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string" || parsed.id.length === 0) {
      throw new Error("Invalid cursor shape");
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) throw new Error("Invalid cursor timestamp");
    return { createdAt, id: parsed.id };
  } catch {
    throw new BadRequestException("Invalid roommate message cursor");
  }
}
