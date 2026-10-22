import { assistantEnabled } from "@/lib/assistant/server";

export const dynamic = "force-dynamic";

/** Lets the browser hide the assistant when the server has no ANTHROPIC_API_KEY. */
export function GET() {
  return Response.json({ enabled: assistantEnabled() }, { headers: { "Cache-Control": "no-store" } });
}
