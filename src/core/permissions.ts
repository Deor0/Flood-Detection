/**
 * The single place that says who may do what. Every server action and page must go through these
 * helpers; hiding a button is never the protection.
 */

/** Who is acting: a signed-in web user (Clerk id) and/or an SMS sender (phone). */
export type Actor = { userId?: string; phone?: string; isAdmin?: boolean };

type OwnedMissing = { reporterUserId: string | null; reporterPhone: string | null };
type OwnedProgram = { createdByUserId: string };

/** The person who filed the record (by Clerk id, or by phone for SMS reports). */
export function isReporter(actor: Actor, person: OwnedMissing): boolean {
  if (actor.userId && person.reporterUserId === actor.userId) return true;
  return !!actor.phone && person.reporterPhone === actor.phone;
}

export function isHost(actor: Actor, program: OwnedProgram): boolean {
  return !!actor.userId && program.createdByUserId === actor.userId;
}

/** Admins and the reporter edit directly; everyone else can only suggest an edit. */
export function canEditMissingDirectly(actor: Actor, person: OwnedMissing): boolean {
  return !!actor.isAdmin || isReporter(actor, person);
}

/**
 * The reporter and admins mark a record found at once. Anyone else only reports the person safe;
 * that claim waits for the reporter or an admin to confirm, so one account cannot close a case.
 */
export function canMarkFoundDirectly(actor: Actor, person: OwnedMissing): boolean {
  return !!actor.isAdmin || isReporter(actor, person);
}

/** The contact line is private to admins and the reporter. */
export function canSeeContact(actor: Actor, person: OwnedMissing): boolean {
  return !!actor.isAdmin || isReporter(actor, person);
}

/** Only admins re-open a found record. */
export function canReopen(actor: Actor): boolean {
  return !!actor.isAdmin;
}

/** Admins and the host edit or cancel a program. */
export function canManageProgram(actor: Actor, program: OwnedProgram): boolean {
  return !!actor.isAdmin || isHost(actor, program);
}

/** Pending, rejected and cancelled programs are visible to admins and the host only. */
export function canSeeProgramStatus(
  actor: Actor,
  program: OwnedProgram & { status: string },
): boolean {
  return program.status === 'approved' || canManageProgram(actor, program);
}

/** Limits that stop one account from flooding the app. Admins are exempt. */
export const LIMITS = {
  reportsPerUserPer24h: 10,
  pendingProgramsPerUser: 5,
  editRequestsPerUserPending: 10,
} as const;

/** Only admins verify, notify or acknowledge a flood alert. */
export function canSendAlert(actor: Actor): boolean {
  return !!actor.isAdmin;
}
