export type IdentityMemoryState = {
  users: Array<{ id: string; email: string; role: "USER" | "ADMIN" }>;
  bindings: Array<{ id: string; provider: string; issuer: string; subject: string; userId: string }>;
  invites: Array<{ normalizedEmail: string; claimedAt: Date | null; revokedAt: Date | null }>;
  profiles: Array<Record<string, unknown>>;
};

/** Transactional test store: a failed identity binding never commits a user or consumes an invitation. */
export function identityMemory(initial: Partial<IdentityMemoryState> = {}) {
  let state: IdentityMemoryState = { users: [], bindings: [], invites: [], profiles: [], ...initial };
  const prisma = {
    user: { findUnique: async ({ where }: { where: { id?: string; email?: string } }) => state.users.find(user => where.id ? user.id === where.id : user.email === where.email) ?? null },
    $transaction: async <T,>(callback: (database: ReturnType<typeof transaction>) => Promise<T>): Promise<T> => {
      const candidate = structuredClone(state);
      const result = await callback(transaction(candidate)); state = candidate; return result;
    }
  };
  function transaction(candidate: IdentityMemoryState) {
    return {
      $executeRaw: async () => 1,
      user: { findUnique: async ({ where }: { where: { email: string } }) => candidate.users.find(user => user.email === where.email) ?? null,
        create: async ({ data }: { data: { email: string; role: "USER" } }) => { const user = { ...data, id: `user-${candidate.users.length + 1}` }; candidate.users.push(user); return user; } },
      externalAuthIdentity: {
        findUnique: async ({ where, include }: { where: Record<string, Record<string, string>>; include?: { user: boolean } }) => {
          const compound = where.provider_issuer_subject ?? where.provider_issuer_userId;
          const binding = candidate.bindings.find(item => Object.entries(compound).every(([key, value]) => item[key as keyof typeof item] === value));
          return binding ? { ...binding, ...(include?.user ? { user: candidate.users.find(user => user.id === binding.userId)! } : {}) } : null;
        },
        create: async ({ data }: { data: Omit<IdentityMemoryState["bindings"][number], "id"> }) => { const binding = { ...data, id: `binding-${candidate.bindings.length + 1}` }; candidate.bindings.push(binding); return binding; }
      },
      betaInvite: { updateMany: async ({ where, data }: { where: { normalizedEmail: string }; data: { claimedAt: Date } }) => {
        const invite = candidate.invites.find(item => item.normalizedEmail === where.normalizedEmail && !item.claimedAt && !item.revokedAt);
        if (!invite) return { count: 0 }; invite.claimedAt = data.claimedAt; return { count: 1 };
      } },
      profile: { upsert: async ({ create, update }: { create: Record<string, unknown>; update?: Record<string, unknown> }) => { const existing = candidate.profiles.find(profile => profile.email === create.email); if (existing) return Object.assign(existing, update ?? {}); const profile = { ...create }; candidate.profiles.push(profile); return profile; } }
    };
  }
  return { prisma, get state() { return state; } };
}
