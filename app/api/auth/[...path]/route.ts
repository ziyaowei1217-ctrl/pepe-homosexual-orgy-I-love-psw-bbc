import { handleNeonAuthRequest } from "@/lib/neon-auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

async function handler(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return handleNeonAuthRequest(request, (await context.params).path);
}

export { handler as GET, handler as POST };
