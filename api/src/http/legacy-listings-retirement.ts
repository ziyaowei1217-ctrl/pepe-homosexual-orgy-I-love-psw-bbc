import { GoneException } from "@nestjs/common";

export const legacyListingsRetirementBody = Object.freeze({
  statusCode: 410,
  code: "LEGACY_LISTINGS_RETIRED",
  message: "Legacy housing listings API has been retired",
  replacement: "/api/v1/listings"
});

const legacyListingsPath = /^\/api\/v1\/housing-listings(?:\/[^/]+)?\/?$/;

type MiddlewareRequest = {
  method?: string;
  path?: string;
};

type MiddlewareResponse = {
  status(code: number): MiddlewareResponse;
  json(body: typeof legacyListingsRetirementBody): unknown;
  end(): unknown;
};

type NextFunction = () => void;

export function legacyListingsRetired(): never {
  throw new GoneException(legacyListingsRetirementBody);
}

export function legacyListingsOptionsMiddleware(
  request: MiddlewareRequest,
  response: MiddlewareResponse,
  next: NextFunction
) {
  if (request.method === "OPTIONS" && legacyListingsPath.test(request.path ?? "")) {
    response.status(410).json(legacyListingsRetirementBody);
    return;
  }

  next();
}

export function remainingOptionsMiddleware(
  request: MiddlewareRequest,
  response: MiddlewareResponse,
  next: NextFunction
) {
  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  next();
}
