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
      const user = await this.authenticatedUsers.fromBearerToken(token);
      await client.join(`user:${user.id}`);
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
