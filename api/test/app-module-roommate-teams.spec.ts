import "reflect-metadata";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { RoommateTeamsModule } from "../src/roommate-teams/roommate-teams.module";

describe("AppModule roommate teams wiring", () => {
  it("exposes roommate team routes from the production application", () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(imports).toContain(RoommateTeamsModule);
  });
});
