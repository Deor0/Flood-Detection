'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import { cancelRegistration, createProgram, registerForProgram } from '@/core/programs/service';
import type { FormState } from '@/app/form-state';

const SIGN_IN = 'Your session ended. Sign in again to continue.';
const SERVER_ERROR = 'Something went wrong on our side. Try again in a moment.';
const text = (fd: FormData, key: string) => String(fd.get(key) ?? '');

export async function hostAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { userId } = await auth();
  if (!userId) return { message: SIGN_IN };
  try {
    const result = await createProgram(getDb(), userId, {
      title: text(fd, 'title'),
      category: text(fd, 'category'),
      organizer: text(fd, 'organizer'),
      location: text(fd, 'location'),
      topics: text(fd, 'topics'),
      startsAt: text(fd, 'startsAt'),
      endsAt: text(fd, 'endsAt'),
      capacity: text(fd, 'capacity'),
    });
    if (!result.ok)
      return {
        fields: result.fields as Record<string, string>,
        message: 'Check the highlighted fields.',
      };
    revalidatePath('/communities');
    return { ok: true, message: `“${result.program.title}” is now listed.` };
  } catch (err) {
    console.error('hostAction failed', err);
    return { message: SERVER_ERROR };
  }
}

const REASONS = {
  not_found: 'That program no longer exists.',
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
    await cancelRegistration(getDb(), userId, programId);
    revalidatePath('/communities');
    return { ok: true, message: 'Registration cancelled.' };
  } catch (err) {
    console.error('cancelAction failed', err);
    return { message: SERVER_ERROR };
  }
}
