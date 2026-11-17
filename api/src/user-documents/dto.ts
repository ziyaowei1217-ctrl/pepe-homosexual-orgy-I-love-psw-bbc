import { IsInt, IsObject, Max, Min } from "class-validator";

export class PutUserDocumentDto {
  @IsObject()
  value!: Record<string, unknown>;

  /** The revision this value was based on; 0 for the first write. */
  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  baseRevision!: number;
}
