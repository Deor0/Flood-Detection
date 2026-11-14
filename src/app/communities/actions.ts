'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import {
  cancelProgram,
  cancelRegistration,
  createProgram,
  editProgram,
  registerForProgram,
} from '@/core/programs/service';
import { getViewer } from '@/lib/roles';
import type { FormState } from '@/app/form-state';

const SIGN_IN = 'Your session ended. Sign in again to continue.';
const SERVER_ERROR = 'Something went wrong on our side. Try again in a moment.';
const text = (fd: FormData, key: string) => String(fd.get(key) ?? '');

const programInput = (fd: FormData) => ({
  title: text(fd, 'title'),
  category: text(fd, 'category'),
  organizer: text(fd, 'organizer'),
  location: text(fd, 'location'),
  topics: text(fd, 'topics'),
  startsAt: text(fd, 'startsAt'),
  endsAt: text(fd, 'endsAt'),
  capacity: text(fd, 'capacity'),
});

export async function hostAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer.userId) return { message: SIGN_IN };
  try {
    const result = await createProgram(
      getDb(),
      { userId: viewer.userId, isAdmin: viewer.isAdmin },
      programInput(fd),
    );
    if (!result.ok) {
      if (result.tooManyPending)
        return {
          message:
            'You already have the maximum number of programs waiting for review. Wait for a decision before submitting more.',
        };
      return {
        fields: result.fields as Record<string, string>,
        message: 'Check the highlighted fields.',
      };
    }
    revalidatePath('/communities');
    revalidatePath('/admin/programs');
    return {
      ok: true,
      message: viewer.isAdmin
        ? `“${result.program.title}” is now listed.`
        : 'Submitted for review. It will appear on this page once an admin approves it.',
    };
  } catch (err) {
    console.error('hostAction failed', err);
    return { message: SERVER_ERROR };
  }
}

const EDIT_REFUSALS = {
  forbidden: 'Only the host or an admin can change this program.',
  not_found: 'That program no longer exists.',
  cancelled: 'This program was cancelled and can no longer be edited.',
  capacity_below_registered:
    'Capacity cannot be lower than the number of people already registered.',
} as const;

/** Bind the program id: `editProgramAction.bind(null, id)` then use as a form action. */
export async function editProgramAction(
  programId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer.userId) return { message: SIGN_IN };
  try {
    const result = await editProgram(
      getDb(),
      { userId: viewer.userId, isAdmin: viewer.isAdmin },
      programId,
      programInput(fd),
    );
    if (!result.ok) {
      if (result.reason === 'invalid')
        return {
          fields: result.fields as Record<string, string>,
          message: 'Check the highlighted fields.',
        };
      return { message: EDIT_REFUSALS[result.reason] };
    }
    revalidatePath('/communities');
    revalidatePath('/admin/programs');
    return { ok: true, message: 'Saved.' };
  } catch (err) {
    console.error('editProgramAction failed', err);
    return { message: SERVER_ERROR };
  }
}

export async function cancelProgramAction(programId: string): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer.userId) return { message: SIGN_IN };
  try {
    const result = await cancelProgram(
      getDb(),
      { userId: viewer.userId, isAdmin: viewer.isAdmin },
      programId,
    );
    revalidatePath('/communities');
    revalidatePath('/admin/programs');
    if (result.ok) return { ok: true, message: 'Program cancelled.' };
    return {
      message:
        result.reason === 'forbidden'
          ? 'Only the host or an admin can cancel this program.'
          : result.reason === 'already_cancelled'
            ? 'This program is already cancelled.'
            : 'That program no longer exists.',
    };
  } catch (err) {
    console.error('cancelProgramAction failed', err);
    return { message: SERVER_ERROR };
  }
}

const REASONS = {
  not_found: 'That program no longer exists.',
  not_open: 'This program is not open for registration.',
  full: 'This program is full.',
  already_registered: 'You are already registered.',
  ended: 'This program has already ended.',
} as const;

export async function registerAction(programId: string): Promise<FormState> {
  const { userId } = await auth();
  if (!userId) return { message: SIGN_IN };
  try {
    const result = await registerForProgram(getDb(), userId, programId);
    revalidatePath('/communities');
    return result.ok
      ? { ok: true, message: 'You are registered.' }
      : { message: REASONS[result.reason] };
  } catch (err) {
    console.error('registerAction failed', err);
    return { message: SERVER_ERROR };
  }
}

export async function cancelAction(programId: string): Promise<FormState> {
  const { userId } = await auth();
  if (!userId) return { message: SIGN_IN };
  try {
    const result = await cancelRegistration(getDb(), userId, programId);
    revalidatePath('/communities');
    return result.ok
      ? { ok: true, message: 'Registration cancelled.' }
      : { message: 'You were not registered for this program.' };
  } catch (err) {
    console.error('cancelAction failed', err);
    return { message: SERVER_ERROR };
  }
}
