// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AccountExperience } from '../components/marketplace/account-experience';
import { readStoredAuthSession, writeStoredAuthSession } from '../lib/auth-session';
afterEach(()=>{cleanup();localStorage.clear();vi.unstubAllGlobals();});
it('keeps credentials and offers retry when server logout fails; clears only after revocation succeeds',async()=>{
 writeStoredAuthSession('token-a');let failed=true;let logoutCalls=0;
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);
  if(url.endsWith('/auth/logout')) {logoutCalls++;expect(init?.method).toBe('POST');return Response.json({}, {status:failed?503:201});}
  if(url.endsWith('/auth/me'))return Response.json({id:'u',email:'u@example.test',role:'USER'});
  if(url.endsWith('/profiles/me'))return Response.json({id:'p',displayName:'Test',role:'renter'});
  if(url.endsWith('/applications/mine'))return Response.json([]);
  return Response.json({},{status:404});
 }));
 render(<AccountExperience mode='overview'/>);
 fireEvent.click(await screen.findByRole('button',{name:'退出登录'}));
 await screen.findByRole('alert');expect(logoutCalls).toBe(1);expect(readStoredAuthSession()?.accessToken).toBe('token-a');
 failed=false;fireEvent.click(screen.getByRole('button',{name:'退出登录'}));
 await waitFor(()=>expect(readStoredAuthSession()).toBeNull());expect(logoutCalls).toBe(2);
});
