import { describe,it,expect } from 'vitest';
import { BadRequestException,ConflictException } from '@nestjs/common';
import { postDemoLedgerPair } from '../src/demo-payments/demo-ledger';
import { parseStrictDate } from '../src/http/strict-date';
const input={paymentId:'p1',heldFundId:'h1',event:'HOLD' as const,amountCents:123,idempotencyKey:'audit-key-0001'};
const pair=[{...input,account:'RENTER_CLEARING',direction:'DEBIT'},{...input,account:'HELD_FUNDS',direction:'CREDIT'}];
const txn=(rows:unknown[])=>({demoLedgerEntry:{findMany:async()=>rows,createMany:async()=>({count:2})}}) as never;
describe('audit independent ledger invariant boundaries',()=>{
 for(const field of ['paymentId','heldFundId','event','amountCents','account','direction']){
  it(`rejects reused key with changed ${field}`,async()=>{
   const rows=pair.map(x=>({...x}));(rows[0] as any)[field]=field==='amountCents'?124:'other';
   await expect(postDemoLedgerPair(txn(rows),input)).rejects.toBeInstanceOf(ConflictException);
  });
 }
 it('rejects incomplete and duplicate pairs',async()=>{
  for(const rows of [[pair[0]],[pair[0],pair[0]],[...pair,pair[0]]])await expect(postDemoLedgerPair(txn(rows),input)).rejects.toBeInstanceOf(ConflictException);
 });
 for(const amountCents of [-1,0,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
  it(`rejects amount ${amountCents}`,async()=>{await expect(postDemoLedgerPair(txn([]),{...input,amountCents})).rejects.toBeInstanceOf(BadRequestException)});
 }
 it('converges to exact existing pair after unique race',async()=>{
  let reads=0; const tx={demoLedgerEntry:{findMany:async()=>++reads===1?[]:pair,createMany:async()=>{throw {code:'P2002'}}}};
  expect(await postDemoLedgerPair(tx as never,input)).toEqual(pair);
 });
 for(const failure of [new Error('network'),null,{code:'OTHER'}]){
  it(`propagates nonunique failure ${String(failure)}`,async()=>{
   const tx={demoLedgerEntry:{findMany:async()=>[],createMany:async()=>{throw failure}}};
   await expect(postDemoLedgerPair(tx as never,input)).rejects.toBe(failure);
  });
 }
 it('rejects missing entries after successful create',async()=>{await expect(postDemoLedgerPair(txn([]),input)).rejects.toBeInstanceOf(ConflictException)});
});
describe('audit independent date boundaries',()=>{
 for(const value of ['2025-02-29','1900-02-29','2026-04-31','2026-00-20','2026-01-00','2026-10-08T25:00:00Z','+002026-10-08','2026-10-08 junk','0099-10-08']){
  it(`rejects ${value}`,()=>expect(()=>parseStrictDate(value,'date')).toThrow(BadRequestException));
 }
 for(const value of ['2024-02-29','2000-02-29','2026-12-31','2026-01-01']){
  it(`accepts ${value}`,()=>expect(parseStrictDate(value,'date').toISOString().slice(0,10)).toBe(value));
 }
});
