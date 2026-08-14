import { MODULE_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { ApplicationsModule } from "../src/applications/applications.module";
import { DemoPaymentsModule } from "../src/demo-payments/demo-payments.module";

describe("AppModule marketplace demo wiring", () => {
  it("registers applications and explicitly named demo payments", () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];
    expect(imports).toEqual(expect.arrayContaining([ApplicationsModule, DemoPaymentsModule]));
  });
});
