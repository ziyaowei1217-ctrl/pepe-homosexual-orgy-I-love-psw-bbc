import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";

import { AuthenticatedRequest } from "./auth.guard";
import { AuthenticatedUserService } from "./authenticated-user.service";

// Attaches the signed-in user when the request carries a session that AuthGuard would accept (same signature, age,
// user and role-dependent session length checks); any other request continues as a guest.
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(@Inject(AuthenticatedUserService) private readonly authenticatedUsers: AuthenticatedUserService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Partial<AuthenticatedRequest> & { headers: { authorization?: string } }>();
    const header = request.headers.authorization;
    const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    if (!token) return true;

    try {
      request.user = await this.authenticatedUsers.fromBearerToken(token);
    } catch {
      // An invalid, expired or unknown session is treated as no session.
    }
    return true;
  }
}
