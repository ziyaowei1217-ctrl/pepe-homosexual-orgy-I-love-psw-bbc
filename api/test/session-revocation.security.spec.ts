import "reflect-metadata";
import { JwtService } from "@nestjs/jwt";
import { describe, expect, it } from "vitest";
import { AuthenticatedUserService } from "../src/auth/authenticated-user.service";

const key = "independent-session-test-key-32-bytes-long";
const user = { id: "user-1", email: "user@example.test", role: "USER" };
const claims = { sub: user.id, sid: "session-a", purpose: "session", iss: "sublet-api", aud: "sublet-web" };
function setup() {
 const rows = new Map([['session-a',{id:'session-a',userId:user.id,expiresAt:new Date(Date.now()+3600000),revokedAt:null as Date|null}]]);
 const prisma = {user:{findUnique:async()=>user},authSession:{findUnique:async({where}:{where:{id:string}})=>rows.get(where.id)??null}};
 return {rows,jwt:new JwtService({secret:key}),service:new AuthenticatedUserService(new JwtService({secret:key}),prisma as never)};
}
describe('persistent session security boundary',()=>{
 it.each([
  ['legacy', {sub:user.id}], ['wrong audience',{...claims,aud:'other-service'}],
  ['wrong issuer',{...claims,iss:'other-issuer'}], ['wrong purpose',{...claims,purpose:'password-reset'}]
 ])('rejects %s bearer',async(_name,payload)=>{
  const {jwt,service}=setup();await expect(service.fromBearerToken(await jwt.signAsync(payload,{expiresIn:'1h'}))).rejects.toThrow();
 });
 it('rejects a copied signed bearer after durable revocation',async()=>{
  const {jwt,service,rows}=setup();const token=await jwt.signAsync(claims,{expiresIn:'1h'});
  await expect(service.fromBearerToken(token)).resolves.toMatchObject(user);
  rows.get('session-a')!.revokedAt=new Date();await expect(service.fromBearerToken(token)).rejects.toThrow();
 });
 it('rejects an expired persisted session even when JWT expiry is later',async()=>{
  const {jwt,service,rows}=setup();rows.get('session-a')!.expiresAt=new Date(0);
  await expect(service.fromBearerToken(await jwt.signAsync(claims,{expiresIn:'1h'}))).rejects.toThrow();
 });
 it('rejects session identifiers belonging to another user',async()=>{
  const {jwt,service,rows}=setup();rows.get('session-a')!.userId='someone-else';
  await expect(service.fromBearerToken(await jwt.signAsync(claims,{expiresIn:'1h'}))).rejects.toThrow();
 });
});
