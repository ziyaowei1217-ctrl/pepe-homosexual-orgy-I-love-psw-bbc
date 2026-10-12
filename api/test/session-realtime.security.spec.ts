import "reflect-metadata";
import { expect, it, vi } from "vitest";
import { RoommateConversationGateway } from "../src/roommate-conversations/roommate-conversations.gateway";

it('routes private events only to durable active sessions, never a revoked device user room',async()=>{
 const active=['other-device'];
 const users={activeSessionIds:async()=>active};
 const gateway=new RoommateConversationGateway(users as never);
 const emitted:string[]=[];
 gateway.server={to:(room:string)=>({emit:()=>emitted.push(room)})} as never;
 await gateway.publish({name:'roommate.message.created',deliveries:[{userId:'user-1',payload:{message:{id:'private'}}}]} as never);
 expect(emitted).toEqual(['session:other-device']);
});
it('rechecks a session after joining so concurrent logout cannot leave a connected socket',async()=>{
 const fromBearerToken=vi.fn().mockResolvedValueOnce({id:'user-1',sessionId:'device-a'}).mockRejectedValueOnce(new Error('revoked'));
 const gateway=new RoommateConversationGateway({fromBearerToken} as never);
 const client={id:'socket-a',handshake:{auth:{token:'valid-before-logout'}},join:vi.fn(),disconnect:vi.fn(),once:vi.fn()};
 await gateway.handleConnection(client as never);
 expect(client.disconnect).toHaveBeenCalledWith(true);
});
