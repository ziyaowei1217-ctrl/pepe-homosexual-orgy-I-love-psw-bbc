import { Inject } from "@nestjs/common";
import {
  ConnectedSocket,
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import type { Namespace, Socket } from "socket.io";

import { AuthenticatedUserService } from "../auth/authenticated-user.service";
import type { RoommateConversationEvent, RoommateConversationEvents } from "./roommate-conversation-events";

@WebSocketGateway({ namespace: "/roommate-messaging" })
export class RoommateConversationGateway implements OnGatewayConnection, RoommateConversationEvents {
  @WebSocketServer()
  server: Namespace;

  constructor(@Inject(AuthenticatedUserService) private readonly authenticatedUsers: AuthenticatedUserService) {}

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    const token = client.handshake.auth?.token;
    if (typeof token !== "string" || !token) {
      client.disconnect(true);
      return;
    }

    try {
      const { user, expiresAt } = await this.authenticatedUsers.fromBearerTokenWithExpiry(token);
      const remainingMs = expiresAt - Date.now();
      if (remainingMs <= 0) {
        client.disconnect(true);
        return;
      }
      await client.join(`user:${user.id}`);
      const remainingAfterJoinMs = expiresAt - Date.now();
      if (remainingAfterJoinMs <= 0 || client.connected === false) {
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

  async publish(event: RoommateConversationEvent): Promise<void> {
    for (const delivery of event.deliveries) {
      this.server.to(`user:${delivery.userId}`).emit(event.name, delivery.payload);
    }
  }
}
