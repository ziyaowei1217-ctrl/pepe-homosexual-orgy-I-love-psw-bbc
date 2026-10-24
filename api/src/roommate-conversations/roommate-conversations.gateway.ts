import { Inject } from "@nestjs/common";
import {
  ConnectedSocket,
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import type { Namespace, Socket } from "socket.io";

import { AuthenticatedUserService, MAX_BEARER_TOKEN_LENGTH } from "../auth/authenticated-user.service";
import { isAllowedSocketOrigin } from "./socket-origin";
import type { RoommateConversationEvent, RoommateConversationEvents } from "./roommate-conversation-events";

export const SOCKET_AUTH_TIMEOUT_MS = 3_500;

@WebSocketGateway({ namespace: "/roommate-messaging" })
export class RoommateConversationGateway implements OnGatewayConnection, RoommateConversationEvents {
  @WebSocketServer()
  server: Namespace;

  constructor(@Inject(AuthenticatedUserService) private readonly authenticatedUsers: AuthenticatedUserService) {}

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    const token = client.handshake.auth?.token;
    if (!isAllowedSocketOrigin(client.handshake.headers?.origin) || typeof token !== "string" || !token || token.length > MAX_BEARER_TOKEN_LENGTH) {
      client.disconnect(true);
      return;
    }

    try {
      const { user, expiresAt } = await this.authenticateWithinDeadline(token);
      const remainingMs = expiresAt - Date.now();
      if (remainingMs <= 0 || this.isDisconnected(client)) {
        client.disconnect(true);
        return;
      }
      await client.join(`user:${user.id}`);
      const remainingAfterJoinMs = expiresAt - Date.now();
      if (remainingAfterJoinMs <= 0 || this.isDisconnected(client)) {
        client.disconnect(true);
        return;
      }
      // A live connection must not retain private message access after its JWT expires.
      const expiryTimer = setTimeout(() => client.disconnect(true), remainingAfterJoinMs);
      expiryTimer.unref();
      client.once("disconnect", () => clearTimeout(expiryTimer));
    } catch {
      client.disconnect(true);
    }
  }

  private isDisconnected(client: Socket) {
    return client.connected === false;
  }

  private async authenticateWithinDeadline(token: string) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.authenticatedUsers.fromBearerTokenWithExpiry(token),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("Socket authentication timed out")), SOCKET_AUTH_TIMEOUT_MS);
        })
      ]);
    } finally { if (timer) clearTimeout(timer); }
  }

  async publish(event: RoommateConversationEvent): Promise<void> {
    for (const delivery of event.deliveries) {
      this.server.to(`user:${delivery.userId}`).emit(event.name, delivery.payload);
    }
  }
}
