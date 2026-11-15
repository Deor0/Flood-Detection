'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import { publicId } from '@/core/missing/names';
import {
  editMissing,
  markFound,
  reopenMissing,
  reportMissing,
  requestEdit,
} from '@/core/missing/service';
import { getViewer } from '@/lib/roles';
import type { FormState } from '@/app/form-state';

const SIGN_IN = 'Your session ended. Sign in again to continue.';
const SERVER_ERROR = 'Something went wrong on our side. Try again in a moment.';
const FORBIDDEN = 'You do not have permission to do that.';
const text = (fd: FormData, key: string) => String(fd.get(key) ?? '');

function details(fd: FormData) {
  return {
    name: text(fd, 'name'),
    age: text(fd, 'age'),
    lastSeenLocation: text(fd, 'lastSeenLocation'),
    notes: text(fd, 'notes'),
    contact: text(fd, 'contact'),
  };
}

async function actor() {
  const viewer = await getViewer();
  return viewer.userId ? { userId: viewer.userId, isAdmin: viewer.isAdmin } : null;
}

export async function reportAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const who = await actor();
  if (!who) return { message: SIGN_IN };
  try {
    const result = await reportMissing(getDb(), who, details(fd));
    if (!result.ok) {
      if (result.rateLimited)
        return {
          message:
            'You have reached the limit of 10 reports in 24 hours. Please try again later, or ask an admin for help.',
        };
      return {
        fields: result.fields as Record<string, string>,
        message: 'Check the highlighted fields.',
      };
    }
    revalidatePath('/missing');
    return { ok: true, message: `Report filed as #${publicId(result.person.publicNumber)}.` };
  } catch (err) {
    console.error('reportAction failed', err);
    return { message: SERVER_ERROR };
  }
}

export async function markFoundAction(
  id: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const who = await actor();
  if (!who) return { message: SIGN_IN };
  if (fd.get('confirm') !== 'yes')
    return { message: 'Tick the box to confirm this person has been found.' };
  try {
    const result = await markFound(getDb(), who, id, text(fd, 'note'));
    revalidatePath('/missing');
    if (result.ok) return { ok: true, message: 'Marked as found.' };
    if (result.reason === 'rate_limited')
      return {
        message: 'You have marked several people as found. Wait a few minutes and try again.',
      };
    return {
      ok: result.reason === 'already_found',
      message:
        result.reason === 'already_found'
          ? 'Already marked as found.'
          : 'That record no longer exists.',
    };
  } catch (err) {
    console.error('markFoundAction failed', err);
    return { message: SERVER_ERROR };
  }
}

/** Direct edit: admins and the reporter only (checked again in the service). */
export async function editAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const who = await actor();
  if (!who) return { message: SIGN_IN };
  try {
    const result = await editMissing(getDb(), who, id, details(fd));
    if (!result.ok) {
      if (result.reason === 'invalid')
        return {
          fields: result.fields as Record<string, string>,
          message: 'Check the highlighted fields.',
        };
      if (result.reason === 'forbidden')
        return {
          message: 'Only the reporter or an admin can edit this record. Suggest an edit instead.',
        };
      return { message: 'That record no longer exists.' };
    }
    revalidatePath('/missing');
    return { ok: true, message: result.changed.length ? 'Details updated.' : 'Nothing changed.' };
  } catch (err) {
    console.error('editAction failed', err);
    return { message: SERVER_ERROR };
  }
}

export async function requestEditAction(
  id: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const who = await actor();
  if (!who) return { message: SIGN_IN };
  try {
    const result = await requestEdit(getDb(), who, id, details(fd));
    if (result.ok)
      return {
        ok: true,
        message: 'Sent for admin review. The record will change once it is approved.',
      };
    switch (result.reason) {
      case 'invalid':
        return {
          fields: result.fields as Record<string, string>,
          message: 'Check the highlighted fields.',
        };
      case 'no_change':
        return { message: 'That is the same as the current record. Change something first.' };
      case 'too_many':
        return {
          message:
            'You already have 10 suggestions waiting for review. Wait for an admin to review some first.',
        };
      case 'use_direct_edit':
        return { message: 'You can edit this record directly.' };
      case 'forbidden':
        return { message: FORBIDDEN };
      default:
        return { message: 'That record no longer exists.' };
    }
  } catch (err) {
    console.error('requestEditAction failed', err);
    return { message: SERVER_ERROR };
  }
}

/** Admin only: found -> missing again, with a reason. */
export async function reopenAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const who = await actor();
  if (!who) return { message: SIGN_IN };
  if (!who.isAdmin) return { message: FORBIDDEN };
  try {
    const result = await reopenMissing(getDb(), who, id, text(fd, 'reason'));
    revalidatePath('/missing');
    revalidatePath('/admin/missing');
    if (result.ok) return { ok: true, message: 'Record re-opened.' };
    const msg = {
      invalid: 'Give a reason (3 to 500 characters).',
      forbidden: FORBIDDEN,
      not_found: 'That record no longer exists.',
      already_missing: 'That record is already marked as missing.',
    } as const;
    return { message: msg[result.reason] };
  } catch (err) {
    console.error('reopenAction failed', err);
    return { message: SERVER_ERROR };
  }
}
