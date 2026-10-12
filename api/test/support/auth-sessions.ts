import { randomUUID } from "node:crypto";
import type { JwtService } from "@nestjs/jwt";
import { signSessionToken } from "../../src/auth/session-token";

type Session = { id: string; userId: string; expiresAt: Date; createdAt: Date; revokedAt: Date | null; mfaVerifiedAt?: Date };
export function createTestSessionStore() {
 const rows = new Map<string, Session>();
 return {
  rows,
  async create({data}:{data:{userId:string;expiresAt:Date;id?:string;mfaVerifiedAt?:Date}}) {
   const row = {id:data.id??randomUUID(),userId:data.userId,expiresAt:data.expiresAt,createdAt:new Date(),revokedAt:null,mfaVerifiedAt:data.mfaVerifiedAt};rows.set(row.id,row);return row;
  },
  async findUnique({where}:{where:{id:string}}) {return rows.get(where.id)??null;},
  async findMany({where}:{where:{userId:string;revokedAt:null;expiresAt:{gt:Date}}}) {return [...rows.values()].filter(r=>r.userId===where.userId&&!r.revokedAt&&r.expiresAt>where.expiresAt.gt);},
  async updateMany({where,data}:{where:{id:string;userId?:string;revokedAt?:null};data:{revokedAt:Date}}) {
   const row=rows.get(where.id);if(!row || (where.userId&&row.userId!==where.userId)||row.revokedAt)return {count:0};Object.assign(row,data);return {count:1};
  }
 };
}
export function withTestSessions<T extends object>(prisma:T) {
 const existing=prisma as T & {authSession?: ReturnType<typeof createTestSessionStore>};
 existing.authSession??=createTestSessionStore();
 return existing as T & {authSession:ReturnType<typeof createTestSessionStore>};
}
// Real Prisma clients retain their actual table; mocks gain an explicit in-memory
// table. Tokens are always backed by a created session, never accepted implicitly.
export async function signTestSession(jwt:JwtService, prisma:object, payload:Record<string,unknown>, _options?:unknown) {
 const session=await withTestSessions(prisma).authSession.create({data:{userId:payload.sub as string,expiresAt:new Date(Date.now()+7*86400000)}});
 return signSessionToken(jwt,session,payload);
}

// Business-flow fixtures explicitly provision a verified factor and matching
// session claim. Actual TOTP/enrollment/replay behavior is covered against PG.
export async function signTestMfaSession(jwt: JwtService, prisma: object, payload: Record<string, unknown>) {
 const db = withTestSessions(prisma) as ReturnType<typeof withTestSessions> & {userMfa?: {upsert: (args: any) => Promise<unknown>;findUnique: (args:any)=>Promise<unknown>}};
 if (!db.userMfa) {const rows=new Map<string,unknown>(); db.userMfa={async upsert({where,create}){rows.set(where.userId,create);return create;},async findUnique({where}){return rows.get(where.userId)??null;}};}
 const now=new Date();
 await db.userMfa.upsert({where:{userId:payload.sub},create:{userId:payload.sub,enabledAt:now},update:{enabledAt:now}});
 const session=await db.authSession.create({data:{userId:payload.sub as string,expiresAt:new Date(Date.now()+7*86400000),mfaVerifiedAt:now}});
 return signSessionToken(jwt,session,{...payload,mfaVerifiedAt:now.getTime()});
}
