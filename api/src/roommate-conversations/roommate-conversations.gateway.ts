import { Inject, OnModuleDestroy } from "@nestjs/common";
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import type { Namespace, Socket } from "socket.io";

import { AuthenticatedUserService } from "../auth/authenticated-user.service";
import type { RoommateConversationEvent, RoommateConversationEvents } from "./roommate-conversation-events";

@WebSocketGateway({ namespace: "/roommate-messaging" })
export class RoommateConversationGateway implements OnGatewayConnection, OnGatewayInit, OnModuleDestroy, RoommateConversationEvents {
  @WebSocketServer()
  server: Namespace;

  private readonly connections = new Map<string, { client: Socket; userId: string; sessionId: string }>();
  private timer?: ReturnType<typeof setInterval>;
  private unsubscribe?: () => void;
  private checking = false;

  constructor(@Inject(AuthenticatedUserService) private readonly authenticatedUsers: AuthenticatedUserService) {}

  afterInit() {
    this.unsubscribe = this.authenticatedUsers.onSessionRevoked((id) => {
      for (const connection of this.connections.values()) {
        if (connection.sessionId === id) connection.client.disconnect(true);
      }
      // The Redis adapter forwards this disconnect to other instances.
      this.server.in(`session:${id}`).disconnectSockets(true);
    });
    this.timer = setInterval(() => { void this.revalidateConnections(); }, 1000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.unsubscribe?.();
    this.connections.clear();
  }

  private async revalidateConnections() {
    if (this.checking) return;
    this.checking = true;
    try {
      for (const userId of new Set([...this.connections.values()].map((entry) => entry.userId))) {
        let active = new Set<string>();
        try { active = new Set(await this.authenticatedUsers.activeSessionIds(userId)); }
        catch { /* Fail closed on lookup failure, including lost cross-instance revocation events. */ }
        for (const entry of this.connections.values()) {
          if (entry.userId === userId && !active.has(entry.sessionId)) entry.client.disconnect(true);
        }
      }
    } finally { this.checking = false; }
  }

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    const token = client.handshake.auth?.token;
    if (typeof token !== "string" || !token) {
      client.disconnect(true);
      return;
    }

    try {
      const user = await this.authenticatedUsers.fromBearerToken(token);
      this.connections.set(client.id, { client, userId: user.id, sessionId: user.sessionId });
      client.once("disconnect", () => { this.connections.delete(client.id); });
      await client.join(`session:${user.sessionId}`);
      // Logout may have committed while join was in progress.
      await this.authenticatedUsers.fromBearerToken(token);
    } catch {
      client.disconnect(true);
    }
  }

  async publish(event: RoommateConversationEvent): Promise<void> {
    for (const delivery of event.deliveries) {
      // Never broadcast private payloads to an unchecked user room: revoked/expired
      // sessions must remain excluded even while the adapter is reconnecting.
      for (const id of await this.authenticatedUsers.activeSessionIds(delivery.userId)) {
        this.server.to(`session:${id}`).emit(event.name, delivery.payload);
      }
    }
  }
}
