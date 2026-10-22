import type Anthropic from "@anthropic-ai/sdk";

import type { PreviewListing } from "../../lib/preview-data";

export function fixtureListing(overrides: Partial<PreviewListing> & Pick<PreviewListing, "id" | "title">): PreviewListing {
  return {
    area: "Los Angeles · Westwood",
    image: "",
    price: 1500,
    originalPrice: 1600,
    beds: 1,
    baths: 1,
    commute: "步行 10 分钟到 UCLA",
    transit: "近地铁 · Westwood",
    trust: "房东已认证",
    tags: ["Wi-Fi", "带家具"],
    score: 4.9,
    availableFrom: "2026-06-01",
    availableTo: "2026-09-30",
    latitude: 34.06,
    longitude: -118.44,
    ...overrides
  };
}

export const fixtureListings = [
  fixtureListing({ id: "westwood-a", title: "Westwood 主卧", price: 1400 }),
  fixtureListing({ id: "westwood-b", title: "Westwood 一室", price: 1900, beds: 2 }),
  fixtureListing({ id: "ktown-c", title: "Koreatown 单间", area: "Los Angeles · Koreatown", commute: "地铁 20 分钟到 USC", transit: "公交 5 分钟", price: 1200 })
];

type Reply = { content: unknown[]; stop_reason: string; output_tokens?: number };

/** Stands in for the Anthropic client: replays scripted replies and records each request body. */
export function fakeAnthropic(replies: Reply[]) {
  const requests: Record<string, any>[] = [];
  const next = (params: Record<string, unknown>) => {
    requests.push(structuredClone(params));
    const reply = replies.shift();
    if (!reply) throw new Error("no scripted reply left");
    return { content: reply.content, stop_reason: reply.stop_reason, usage: { output_tokens: reply.output_tokens ?? 100 } };
  };
  const client = {
    beta: {
      messages: {
        stream(params: Record<string, unknown>) {
          const message = next(params);
          let onText: ((text: string) => void) | undefined;
          return {
            on(event: string, listener: (text: string) => void) {
              if (event === "text") onText = listener;
              return this;
            },
            async finalMessage() {
              for (const block of message.content as Array<{ type: string; text?: string }>) if (block.type === "text") onText?.(block.text ?? "");
              return message;
            }
          };
        },
        async create(params: Record<string, unknown>) {
          return next(params);
        }
      }
    }
  };
  return { client: client as unknown as Anthropic, requests };
}

export function assistantRequest(path: string, body: unknown, token: string | null = "token-1") {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });
}

export async function readEvents(response: Response) {
  return (await response.text()).split("\n\n").filter(Boolean).map((chunk) => JSON.parse(chunk.replace(/^data: /, "")));
}
