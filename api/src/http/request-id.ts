import { randomUUID } from "node:crypto";

export type RequestWithId = {
  requestId: string;
  method?: string;
  originalUrl?: string;
};

export function requestIdMiddleware(
  request: Partial<RequestWithId>,
  response: { setHeader(name: string, value: string): unknown },
  next: () => void
) {
  request.requestId = randomUUID();
  response.setHeader("X-Request-ID", request.requestId);
  next();
}
