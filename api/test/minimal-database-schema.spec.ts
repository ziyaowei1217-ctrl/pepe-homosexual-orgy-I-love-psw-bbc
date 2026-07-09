import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(join(__dirname, "../prisma/schema.prisma"), "utf8");
const migrationsDir = join(__dirname, "../prisma/migrations");
const migrations = readdirSync(migrationsDir)
  .map((folder) => readFileSync(join(migrationsDir, folder, "migration.sql"), "utf8"))
  .join("\n");

describe("minimal marketplace database schema", () => {
  it("defines the requested profile, roommate profile, and listing tables", () => {
    expect(schema).toContain('@@map("profiles")');
    expect(schema).toContain('@@map("roommate_profiles")');
    expect(schema).toContain('@@map("listings")');

    for (const table of ['"profiles"', '"roommate_profiles"', '"listings"']) {
      expect(migrations).toContain(`CREATE TABLE ${table}`);
    }
  });

  it("keeps matching fields focused on lifestyle, budget, lease timing, school, and neighborhood", () => {
    for (const field of [
      "budgetMin",
      "budgetMax",
      "moveInDate",
      "moveOutDate",
      "preferredNeighborhoods",
      "roomType",
      "cleanliness",
      "sleepSchedule",
      "smoking",
      "pets",
      "guests"
    ]) {
      expect(schema).toContain(field);
    }

    expect(schema).not.toMatch(/nationality|race|ethnicity|religion/i);
  });
});
