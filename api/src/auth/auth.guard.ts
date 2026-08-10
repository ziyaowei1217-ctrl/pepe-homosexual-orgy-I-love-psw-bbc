import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthenticatedUserService } from "./authenticated-user.service";

type RequestLike = {
  ip?: string;
  headers: {
    [name: string]: string | string[] | undefined;
    authorization?: string;
  };
};

export type AuthenticatedRequest = RequestLike & {
  user: {
    id: string;
    email: string;
    role: string;
    adminReauthenticatedAt?: number;
  };
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthenticatedUserService) private readonly authenticatedUsers: AuthenticatedUserService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

    if (!token) throw new UnauthorizedException("Missing bearer token");

    request.user = await this.authenticatedUsers.fromBearerToken(token);
    return true;
  }
}
