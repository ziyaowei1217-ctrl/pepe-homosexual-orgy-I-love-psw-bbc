import { describe, expect, it } from "vitest";

import { createListingCopyHandler, parseListingCopyRequest } from "../lib/assistant/listing-copy";
import { assistantRequest, fakeAnthropic } from "./support/assistant-fixtures";

const body = {
  notes: "主卧，带家具，步行 10 分钟到 UCLA，近地铁，可养猫",
  draft: { title: "", area: "Los Angeles · Westwood", availableFrom: "2026-06-01", availableTo: "2026-09-01", beds: 1, baths: 1, price: 1500, commute: "", transit: "", tags: ["Wi-Fi"] }
};

function handlerWith(reply: { content: unknown[]; stop_reason: string }) {
  const fake = fakeAnthropic([reply]);
  const handler = createListingCopyHandler({ client: () => fake.client, claimQuota: async () => "user-1" });
  return { handler, requests: fake.requests };
}

describe("listing copy handler", () => {
  it("returns trimmed fields and only the form's amenity values", async () => {
    const { handler, requests } = handlerWith({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ title: " Westwood 带家具主卧 ", commute: "步行 10 分钟到 UCLA", transit: "近地铁 · Westwood", tags: ["带家具", "宠物友好", "泳池"] }) }]
    });
    const response = await handler(assistantRequest("/api/assistant/listing-copy", body));
    expect(await response.json()).toEqual({ title: "Westwood 带家具主卧", commute: "步行 10 分钟到 UCLA", transit: "近地铁 · Westwood", tags: ["带家具", "宠物友好"] });

    const request = requests[0];
    expect(request.output_config.format.type).toBe("json_schema");
    expect(request.max_tokens).toBe(2000);
    expect(request.messages[0].content).toContain("步行 10 分钟到 UCLA");
    expect(request.messages[0].content).toContain("已选设施：Wi-Fi");
  });

  it("maps a refusal to 422 and a cut-off answer to 502", async () => {
    const declined = handlerWith({ stop_reason: "refusal", content: [] });
    const refused = await declined.handler(assistantRequest("/api/assistant/listing-copy", body));
    expect(refused.status).toBe(422);
    expect(await refused.json()).toEqual({ code: "ASSISTANT_DECLINED" });

    const cut = handlerWith({ stop_reason: "max_tokens", content: [{ type: "text", text: "{\"title\": \"West" }] });
    expect((await cut.handler(assistantRequest("/api/assistant/listing-copy", body))).status).toBe(502);
  });

  it("needs notes and keeps fields within the API's limits", () => {
    expect(parseListingCopyRequest({ ...body, notes: "  " })).toBeNull();
    expect(parseListingCopyRequest({ ...body, draft: { ...body.draft, title: "x".repeat(141) } })).toBeNull();
    expect(parseListingCopyRequest({ ...body, draft: { ...body.draft, beds: 1.5 } })).toBeNull();
    expect(parseListingCopyRequest({ notes: "a", draft: { tags: ["Wi-Fi", "自定义"] } })).toEqual({
      notes: "a",
      draft: { title: "", area: "", availableFrom: "", availableTo: "", commute: "", transit: "", beds: 0, baths: 0, price: 0, tags: ["Wi-Fi"] }
    });
  });
});
