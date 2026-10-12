import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { AuthenticatedUserService } from "./authenticated-user.service";
import { AuthenticatedRequest } from "./auth.guard";

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(@Inject(AuthenticatedUserService) private readonly authenticatedUsers: AuthenticatedUserService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Partial<AuthenticatedRequest> & { headers: { authorization?: string } }>();
    delete request.user;
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (token) {
      try { request.user = await this.authenticatedUsers.fromBearerToken(token); }
      catch { /* This guard is used only on public discovery: invalid credentials remain a guest. */ }
    }
    return true;
  }
}
