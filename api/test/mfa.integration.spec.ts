import "reflect-metadata";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi, afterEach } from "vitest";
import { generate } from "otplib";
import { PrismaService } from "../src/prisma/prisma.service";
import { createDisposablePostgres } from "./support/disposable-postgres";
import { PAYMENT_COMMANDS } from "../src/payments/payment-commands";
import { signSessionToken } from "../src/auth/session-token";
import { signTestSession } from "./support/auth-sessions";
const request=require('supertest') as (server:unknown)=>any;
const database=createDisposablePostgres('auth_mfa');
const suite=process.env.RUN_DB_SMOKE==='1'?describe:describe.skip;
suite('MFA real PostgreSQL enrollment, replay and session binding',()=>{
 let app:INestApplication;let prisma:PrismaService;let jwt:JwtService;
 const old={DATABASE_URL:process.env.DATABASE_URL,NODE_ENV:process.env.NODE_ENV,JWT_SECRET:process.env.JWT_SECRET};
 beforeAll(async()=>{
  database.create();database.migrateDeploy();process.env.DATABASE_URL=database.databaseUrl;process.env.NODE_ENV='test';process.env.JWT_SECRET='mfa-integration-test-only-long-secret';
  const {AppModule}=await import('../src/app.module');
  const module=await Test.createTestingModule({imports:[AppModule]}).compile();app=module.createNestApplication();app.useLogger(false);app.setGlobalPrefix('api/v1');app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));await app.init();prisma=app.get(PrismaService);jwt=app.get(JwtService);
 },90000);
 afterEach(()=>vi.useRealTimers());
 afterAll(async()=>{await app?.close();database.drop();for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 async function fresh(){const user=await prisma.user.create({data:{email:`mfa-${crypto.randomUUID()}@example.test`}});const token=await signTestSession(jwt,prisma,{sub:user.id});return {user,token,http:request(app.getHttpServer())};}
 async function enroll(){const ctx=await fresh();const start=await ctx.http.post('/api/v1/auth/mfa/enrollment').auth(ctx.token,{type:'bearer'}).send({}).expect(201);const code=await generate({secret:start.body.secret});const confirmed=await ctx.http.post('/api/v1/auth/mfa/enrollment/confirm').auth(ctx.token,{type:'bearer'}).send({code}).expect(201);return {...ctx,secret:start.body.secret,confirmed:confirmed.body,code};}
 it('requires proof before enabling, encrypts at rest, and reveals high entropy recovery codes once',async()=>{
  const {user,token,http}=await fresh();
  const setup=await http.post('/api/v1/auth/mfa/enrollment').auth(token,{type:'bearer'}).send({}).expect(201);
  expect(setup.body.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
  const pending=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>('SELECT * FROM "UserMfa" WHERE "userId"=$1',user.id);
  expect(JSON.stringify(pending)).not.toContain(setup.body.secret);
  expect((await http.get('/api/v1/auth/mfa').auth(token,{type:'bearer'})).body.enabled).toBe(false);
  const code=await generate({secret:setup.body.secret});
  const response=await http.post('/api/v1/auth/mfa/enrollment/confirm').auth(token,{type:'bearer'}).send({code}).expect(201);
  expect(response.body.recoveryCodes).toHaveLength(10);expect(new Set(response.body.recoveryCodes).size).toBe(10);
  expect(response.body.recoveryCodes.every((v:string)=>/^[a-f0-9]{32}$/.test(v))).toBe(true);
  await http.post('/api/v1/auth/mfa/enrollment/confirm').auth(token,{type:'bearer'}).send({code}).expect(400);
  const state=await http.get('/api/v1/auth/mfa').auth(response.body.accessToken,{type:'bearer'}).expect(200);
  expect(state.body).toMatchObject({enabled:true,recoveryCodesRemaining:10});expect(state.body.verifiedUntil).toBeTruthy();
  expect(JSON.stringify(state.body)).not.toContain(setup.body.secret);expect(state.body.recoveryCodes).toBeUndefined();
  const hashes=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>('SELECT * FROM "MfaRecoveryCode" WHERE "userId"=$1',user.id);
  for(const recovery of response.body.recoveryCodes)expect(JSON.stringify(hashes)).not.toContain(recovery);
 });
 it('consumes a recovery code exactly once across concurrent sessions and never elevates the other session',async()=>{
  const ctx=await enroll();const second=await signTestSession(jwt,prisma,{sub:ctx.user.id});
  const responses=await Promise.all(Array.from({length:20},()=>ctx.http.post('/api/v1/auth/mfa/verify').auth(second,{type:'bearer'}).send({recoveryCode:ctx.confirmed.recoveryCodes[0]})));
  expect(responses.filter(r=>r.status===201)).toHaveLength(1);expect(responses.filter(r=>r.status===400||r.status===429)).toHaveLength(19);
  const state=await ctx.http.get('/api/v1/auth/mfa').auth(ctx.token,{type:'bearer'}).expect(200);expect(state.body.verifiedUntil).toBeNull();
  const rows=await prisma.$queryRawUnsafe<Array<{count:bigint}>>('SELECT count(*) FROM "MfaRecoveryCode" WHERE "userId"=$1 AND "usedAt" IS NOT NULL',ctx.user.id);expect(Number(rows[0].count)).toBe(1);
 });
 it('rejects reuse of an accepted TOTP time step under concurrent verification',async()=>{
  const ctx=await enroll();
  await ctx.http.post('/api/v1/auth/mfa/verify').auth(ctx.token,{type:'bearer'}).send({code:ctx.code}).expect(400);
  const now=Date.now();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(now+31000);
  const next=await generate({secret:ctx.secret});
  const results=await Promise.all(Array.from({length:20},()=>ctx.http.post('/api/v1/auth/mfa/verify').auth(ctx.token,{type:'bearer'}).send({code:next})));
  expect(results.filter(r=>r.status===201)).toHaveLength(1);expect(results.filter(r=>r.status===400||r.status===429)).toHaveLength(19);
 });
 it('binds pending enrollment to the initiating session and requires recent login',async()=>{
  const {user,token,http}=await fresh();const other=await signTestSession(jwt,prisma,{sub:user.id});
  const setup=await http.post('/api/v1/auth/mfa/enrollment').auth(token,{type:'bearer'}).send({}).expect(201);
  await http.post('/api/v1/auth/mfa/enrollment/confirm').auth(other,{type:'bearer'}).send({code:await generate({secret:setup.body.secret})}).expect(400);
  await prisma.authSession.update({where:{id:jwt.decode<{sid:string}>(token).sid},data:{createdAt:new Date(Date.now()-601000)}});
  await http.post('/api/v1/auth/mfa/enrollment').auth(token,{type:'bearer'}).send({}).expect(403);
 });
 it('rate limits wrong factors durably and forbids email-only disable',async()=>{
  const ctx=await enroll();
  await ctx.http.post('/api/v1/auth/mfa/disable').auth(ctx.token,{type:'bearer'}).send({}).expect(400);
  for(let i=0;i<5;i++)await ctx.http.post('/api/v1/auth/mfa/verify').auth(ctx.token,{type:'bearer'}).send({recoveryCode:'0'.repeat(32)}).expect(400);
  await ctx.http.post('/api/v1/auth/mfa/verify').auth(ctx.token,{type:'bearer'}).send({recoveryCode:ctx.confirmed.recoveryCodes[0]}).expect(429);
 });
 it('allows only the new verified token, never an old token or email-only admin step-up',async()=>{
  const ctx=await enroll();await prisma.user.update({where:{id:ctx.user.id},data:{role:'ADMIN'}});
  const sid=jwt.decode<{sid:string}>(ctx.token).sid;const session=await prisma.authSession.findUniqueOrThrow({where:{id:sid}});
  const emailOnly=await signSessionToken(jwt,session,{adminReauthenticatedAt:Math.floor(Date.now()/1000)});
  for(const token of [ctx.token,emailOnly])await ctx.http.post('/api/v1/admin/listings/nonexistent/approve').auth(token,{type:'bearer'}).send({revision:1}).expect(403);
  await ctx.http.post('/api/v1/admin/listings/nonexistent/approve').auth(ctx.confirmed.accessToken,{type:'bearer'}).send({revision:1}).expect(404);
  await ctx.http.post('/api/v1/payments/applications/nonexistent/checkout').auth(ctx.token,{type:'bearer'}).set('Idempotency-Key','mfa-probe').send({}).expect(403);
  await ctx.http.post('/api/v1/payments/applications/nonexistent/checkout').auth(ctx.confirmed.accessToken,{type:'bearer'}).set('Idempotency-Key','mfa-probe').send({}).expect(404);
  await ctx.http.post('/api/v1/auth/mfa/enrollment').auth(ctx.token,{type:'bearer'}).send({}).expect(400);
  await ctx.http.post('/api/v1/auth/mfa/disable').auth(ctx.token,{type:'bearer'}).send({recoveryCode:ctx.confirmed.recoveryCodes[0]}).expect(201);
  await ctx.http.post('/api/v1/admin/listings/nonexistent/approve').auth(ctx.confirmed.accessToken,{type:'bearer'}).send({revision:1}).expect(403);
  expect((await ctx.http.get('/api/v1/auth/mfa').auth(ctx.confirmed.accessToken,{type:'bearer'})).body).toMatchObject({enabled:false,verifiedUntil:null,recoveryCodesRemaining:0});
  expect(await prisma.mfaRecoveryCode.count({where:{userId:ctx.user.id}})).toBe(0);
 });
 it('requires an independent factor for remote payment accept and cancellation regardless of environment',async()=>{
  const ctx=await fresh();const commands=app.get(PAYMENT_COMMANDS);const previous=commands.execution;
  try {commands.execution='remote';
   for(const action of ['accept','cancel'])await ctx.http.post(`/api/v1/applications/nonexistent/${action}`).auth(ctx.token,{type:'bearer'}).set('Idempotency-Key',`mfa-${action}`).send({reason:'security regression'}).expect(403);
  } finally {commands.execution=previous;}
 });
 it('expires elevated tokens after ten minutes and revocation prevents further factor use',async()=>{
  const ctx=await enroll();const now=Date.now();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(now+600001);
  expect((await ctx.http.get('/api/v1/auth/mfa').auth(ctx.confirmed.accessToken,{type:'bearer'})).body.verifiedUntil).toBeNull();
  await ctx.http.post('/api/v1/payments/applications/nonexistent/checkout').auth(ctx.confirmed.accessToken,{type:'bearer'}).send({}).expect(403);
  vi.useRealTimers();await ctx.http.post('/api/v1/auth/logout').auth(ctx.confirmed.accessToken,{type:'bearer'}).send({}).expect(201);
  await ctx.http.post('/api/v1/auth/mfa/verify').auth(ctx.confirmed.accessToken,{type:'bearer'}).send({recoveryCode:ctx.confirmed.recoveryCodes[0]}).expect(401);
  expect(await prisma.authSession.count({where:{userId:ctx.user.id,revokedAt:null}})).toBe(0);
 });

 it('requires recent email login as well as the existing factor before disabling',async()=>{
  const ctx=await enroll();const sid=jwt.decode<{sid:string}>(ctx.token).sid;
  await prisma.authSession.update({where:{id:sid},data:{createdAt:new Date(Date.now()-600001)}});
  await ctx.http.post('/api/v1/auth/mfa/disable').auth(ctx.confirmed.accessToken,{type:'bearer'}).send({recoveryCode:ctx.confirmed.recoveryCodes[0]}).expect(403);
  expect(await prisma.mfaRecoveryCode.count({where:{userId:ctx.user.id,usedAt:null}})).toBe(10);
  const freshToken=await signTestSession(jwt,prisma,{sub:ctx.user.id});
  await ctx.http.post('/api/v1/auth/mfa/disable').auth(freshToken,{type:'bearer'}).send({recoveryCode:ctx.confirmed.recoveryCodes[0]}).expect(201);
  await ctx.http.get('/api/v1/auth/me').auth(ctx.confirmed.accessToken,{type:'bearer'}).expect(401);
  await ctx.http.get('/api/v1/auth/me').auth(freshToken,{type:'bearer'}).expect(200);
 });

 it('rejects a TOTP after 31 seconds and accepts a code inside the current 30-second step',async()=>{
  const ctx=await fresh();const base=Math.ceil(Date.now()/30000)*30000+1000;
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(base);
  const setup=await ctx.http.post('/api/v1/auth/mfa/enrollment').auth(ctx.token,{type:'bearer'}).send({}).expect(201);
  const expired=await generate({secret:setup.body.secret});
  vi.setSystemTime(base+31000);
  await ctx.http.post('/api/v1/auth/mfa/enrollment/confirm').auth(ctx.token,{type:'bearer'}).send({code:expired}).expect(400);
  const current=await generate({secret:setup.body.secret});vi.setSystemTime(base+58000);
  await ctx.http.post('/api/v1/auth/mfa/enrollment/confirm').auth(ctx.token,{type:'bearer'}).send({code:current}).expect(201);
 });

});
