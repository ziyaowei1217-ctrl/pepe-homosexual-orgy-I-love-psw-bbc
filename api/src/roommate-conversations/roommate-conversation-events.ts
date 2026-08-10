export const ROOMMATE_CONVERSATION_EVENTS = Symbol("ROOMMATE_CONVERSATION_EVENTS");

export type RoommateConversationEventName =
  | "roommate.conversation.created"
  | "roommate.conversation.updated"
  | "roommate.message.created"
  | "roommate.message.read"
  | "roommate.unread.updated";

export type RoommateConversationEvent = {
  name: RoommateConversationEventName;
  userIds: string[];
  payload: Record<string, unknown>;
};

export interface RoommateConversationEvents {
  publish(event: RoommateConversationEvent): Promise<void>;
}

export class NoopRoommateConversationEvents implements RoommateConversationEvents {
  async publish(_event: RoommateConversationEvent) {}
}

