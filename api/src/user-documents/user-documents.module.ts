import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { UserDocumentWriteLimiter } from "./user-document-write-limiter";
import { UserDocumentsController } from "./user-documents.controller";
import { UserDocumentsService } from "./user-documents.service";

@Module({
  imports: [AuthModule],
  controllers: [UserDocumentsController],
  providers: [UserDocumentsService, { provide: UserDocumentWriteLimiter, useValue: new UserDocumentWriteLimiter() }]
})
export class UserDocumentsModule {}
