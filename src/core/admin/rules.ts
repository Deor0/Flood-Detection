/** Pure safety rules for user management. The server actions enforce these; fail closed. */

export function canRevokeAdmin(input: {
  actorId: string;
  targetId: string;
  adminCount: number;
}): { ok: true } | { ok: false; reason: string } {
  if (input.actorId === input.targetId)
    return { ok: false, reason: 'You cannot remove your own admin role.' };
  if (!Number.isFinite(input.adminCount) || input.adminCount <= 1)
    return { ok: false, reason: 'The last remaining admin cannot be demoted.' };
  return { ok: true };
}

export function canBan(input: {
  actorId: string;
  targetId: string;
  targetIsAdmin: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (input.actorId === input.targetId) return { ok: false, reason: 'You cannot ban yourself.' };
  if (input.targetIsAdmin)
    return { ok: false, reason: 'Remove admin access before banning this user.' };
  return { ok: true };
}
