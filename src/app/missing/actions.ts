'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import { publicId } from '@/core/missing/names';
import { editMissing, markFound, reportMissing } from '@/core/missing/service';
import type { FormState } from '@/app/form-state';

const SIGN_IN = 'Your session ended. Sign in again to continue.';
const SERVER_ERROR = 'Something went wrong on our side. Try again in a moment.';
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

export async function reportAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { userId } = await auth();
  if (!userId) return { message: SIGN_IN };
  try {
    const result = await reportMissing(getDb(), { userId }, details(fd));
    if (!result.ok)
      return {
        fields: result.fields as Record<string, string>,
        message: 'Check the highlighted fields.',
      };
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
  const { userId } = await auth();
  if (!userId) return { message: SIGN_IN };
  try {
    const result = await markFound(getDb(), { userId }, id, text(fd, 'note'));
    revalidatePath('/missing');
    if (result.ok) return { ok: true, message: 'Marked as found.' };
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

export async function editAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const { userId } = await auth();
  if (!userId) return { message: SIGN_IN };
  try {
    const result = await editMissing(getDb(), { userId }, id, details(fd));
    if (!result.ok) {
      if (result.reason === 'invalid')
        return {
          fields: result.fields as Record<string, string>,
          message: 'Check the highlighted fields.',
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
