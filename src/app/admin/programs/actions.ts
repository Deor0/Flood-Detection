'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import { approveProgram, cancelProgram, editProgram, rejectProgram } from '@/core/programs/service';
import { requireAdmin } from '@/lib/roles';
import type { FormState } from '@/app/form-state';

const DENIED = 'Admins only.';
const SIGN_IN = 'Your session ended. Sign in again to continue.';
const SERVER_ERROR = 'Something went wrong on our side. Try again in a moment.';
const text = (fd: FormData, key: string) => String(fd.get(key) ?? '');

async function guard() {
  const check = await requireAdmin();
  if (check.ok) return { userId: check.userId };
  return { error: check.reason === 'signed_out' ? SIGN_IN : DENIED };
}

const refresh = () => {
  revalidatePath('/admin/programs');
  revalidatePath('/admin');
  revalidatePath('/communities');
};

const REVIEW_REFUSALS = {
  forbidden: DENIED,
  not_found: 'That program no longer exists.',
  not_pending: 'This program was already reviewed.',
  invalid: 'Give a reason of 3 to 500 characters.',
} as const;

export async function approveProgramAction(programId: string): Promise<FormState> {
  const g = await guard();
  if ('error' in g) return { message: g.error };
  try {
    const r = await approveProgram(getDb(), { userId: g.userId, isAdmin: true }, programId);
    refresh();
    return r.ok
      ? { ok: true, message: 'Approved. It is now listed.' }
      : { message: REVIEW_REFUSALS[r.reason] };
  } catch (err) {
    console.error('approveProgramAction failed', err);
    return { message: SERVER_ERROR };
  }
}

export async function rejectProgramAction(
  programId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const g = await guard();
  if ('error' in g) return { message: g.error };
  try {
    const r = await rejectProgram(
      getDb(),
      { userId: g.userId, isAdmin: true },
      programId,
      text(fd, 'reason'),
    );
    refresh();
    return r.ok
      ? { ok: true, message: 'Rejected. The host can see your reason.' }
      : { message: REVIEW_REFUSALS[r.reason] };
  } catch (err) {
    console.error('rejectProgramAction failed', err);
    return { message: SERVER_ERROR };
  }
}

const EDIT_REFUSALS = {
  forbidden: DENIED,
  not_found: 'That program no longer exists.',
  cancelled: 'This program was cancelled.',
  too_many_pending: 'This host has too many programs waiting for review.',
  capacity_below_registered:
    'Capacity cannot be lower than the number of people already registered.',
} as const;

export async function adminEditProgramAction(
  programId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const g = await guard();
  if ('error' in g) return { message: g.error };
  try {
    const r = await editProgram(getDb(), { userId: g.userId, isAdmin: true }, programId, {
      title: text(fd, 'title'),
      category: text(fd, 'category'),
      organizer: text(fd, 'organizer'),
      location: text(fd, 'location'),
      topics: text(fd, 'topics'),
      startsAt: text(fd, 'startsAt'),
      endsAt: text(fd, 'endsAt'),
      capacity: text(fd, 'capacity'),
    });
    if (!r.ok) {
      if (r.reason === 'invalid')
        return {
          fields: r.fields as Record<string, string>,
          message: 'Check the highlighted fields.',
        };
      return { message: EDIT_REFUSALS[r.reason] };
    }
    refresh();
    return { ok: true, message: 'Saved.' };
  } catch (err) {
    console.error('adminEditProgramAction failed', err);
    return { message: SERVER_ERROR };
  }
}

export async function adminCancelProgramAction(programId: string): Promise<FormState> {
  const g = await guard();
  if ('error' in g) return { message: g.error };
  try {
    const r = await cancelProgram(getDb(), { userId: g.userId, isAdmin: true }, programId);
    refresh();
    if (r.ok) return { ok: true, message: 'Program cancelled.' };
    return {
      message:
        r.reason === 'already_cancelled' ? 'Already cancelled.' : 'That program no longer exists.',
    };
  } catch (err) {
    console.error('adminCancelProgramAction failed', err);
    return { message: SERVER_ERROR };
  }
}
