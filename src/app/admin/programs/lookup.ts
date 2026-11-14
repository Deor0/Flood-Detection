import { clerkClient } from '@clerk/nextjs/server';

/** Clerk id -> "Name (email)". Fails soft: ids that cannot be resolved are simply missing. */
export async function lookupUsers(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return out;
  try {
    const client = await clerkClient();
    for (let i = 0; i < unique.length; i += 100) {
      const { data } = await client.users.getUserList({
        userId: unique.slice(i, i + 100),
        limit: 100,
      });
      for (const u of data) {
        const name = [u.firstName, u.lastName].filter(Boolean).join(' ');
        const email = u.primaryEmailAddress?.emailAddress ?? u.emailAddresses[0]?.emailAddress;
        const label = [name, email && (name ? `(${email})` : email)].filter(Boolean).join(' ');
        if (label) out.set(u.id, label);
      }
    }
  } catch (err) {
    console.error('clerk user lookup failed', err);
  }
  return out;
}

export const whoIs = (names: Map<string, string>, id: string) => names.get(id) ?? id;
