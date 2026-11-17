import { Body, Controller, Get, HttpException, Inject, NotFoundException, Param, Put, Req, Res, UseGuards } from "@nestjs/common";

import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { PutUserDocumentDto } from "./dto";
import { userDocumentKind } from "./user-document-values";
import { UserDocumentWriteLimiter } from "./user-document-write-limiter";
import { UserDocumentsService } from "./user-documents.service";

type HeaderResponse = { setHeader(name: string, value: string): unknown };

@UseGuards(AuthGuard)
@Controller("me/documents")
export class UserDocumentsController {
  constructor(
    @Inject(UserDocumentsService) private readonly documents: UserDocumentsService,
    @Inject(UserDocumentWriteLimiter) private readonly limiter: UserDocumentWriteLimiter
  ) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: HeaderResponse) {
    response.setHeader("Cache-Control", "no-store");
    return this.documents.list(request.user.id);
  }

  @Put(":kind")
  put(
    @Req() request: AuthenticatedRequest,
    @Param("kind") kind: string,
    @Body() dto: PutUserDocumentDto,
    @Res({ passthrough: true }) response: HeaderResponse
  ) {
    response.setHeader("Cache-Control", "no-store");
    if (!userDocumentKind(kind)) throw new NotFoundException();
    // Each kind has its own budget, so frequent feed-signal writes never hold back saves or preferences.
    const retryAfterSeconds = this.limiter.take(`${request.user.id}:${kind}`);
    if (retryAfterSeconds > 0) {
      response.setHeader("Retry-After", String(retryAfterSeconds));
      throw new HttpException(
        { statusCode: 429, error: "Too Many Requests", code: "DOCUMENT_RATE_LIMITED", message: "Too many document writes" },
        429
      );
    }
    return this.documents.put(request.user.id, kind, dto.value, dto.baseRevision);
  }
}
