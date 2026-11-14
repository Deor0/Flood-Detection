'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import {
  approveEditRequest,
  editMissing,
  rejectEditRequest,
  reopenMissing,
} from '@/core/missing/service';
import { requireAdmin } from '@/lib/roles';
import type { FormState } from '@/app/form-state';

const SIGN_IN = 'Your session ended. Sign in again to continue.';
const FORBIDDEN = 'Only admins can do that.';
const SERVER_ERROR = 'Something went wrong on our side. Try again in a moment.';
const text = (fd: FormData, key: string) => String(fd.get(key) ?? '');

function refresh() {
  revalidatePath('/admin/missing');
  revalidatePath('/missing');
}

export async function approveRequestAction(requestId: string): Promise<FormState> {
  const admin = await requireAdmin();
  if (!admin.ok) return { message: admin.reason === 'signed_out' ? SIGN_IN : FORBIDDEN };
  try {
    const r = await approveEditRequest(getDb(), { userId: admin.userId, isAdmin: true }, requestId);
    refresh();
    if (r.ok)
      return {
        ok: true,
        message: r.stale ? 'Approved. The record had changed since the suggestion.' : 'Approved.',
      };
    return {
      message:
        r.reason === 'not_pending'
          ? 'Someone already reviewed this request.'
          : r.reason === 'forbidden'
            ? FORBIDDEN
            : 'That request no longer exists.',
    };
  } catch (err) {
    console.error('approveRequestAction failed', err);
    return { message: SERVER_ERROR };
  }
}

export async function rejectRequestAction(
  requestId: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();
  if (!admin.ok) return { message: admin.reason === 'signed_out' ? SIGN_IN : FORBIDDEN };
  try {
    const r = await rejectEditRequest(
      getDb(),
      { userId: admin.userId, isAdmin: true },
      requestId,
      text(fd, 'reason'),
    );
    refresh();
    if (r.ok) return { ok: true, message: 'Rejected.' };
    return {
      message:
        r.reason === 'invalid'
          ? 'Give a reason (3 to 500 characters).'
          : r.reason === 'not_pending'
            ? 'Someone already reviewed this request.'
            : r.reason === 'forbidden'
              ? FORBIDDEN
              : 'That request no longer exists.',
    };
  } catch (err) {
    console.error('rejectRequestAction failed', err);
    return { message: SERVER_ERROR };
  }
}

export async function adminEditAction(
  id: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();
  if (!admin.ok) return { message: admin.reason === 'signed_out' ? SIGN_IN : FORBIDDEN };
  try {
    const r = await editMissing(getDb(), { userId: admin.userId, isAdmin: true }, id, {
      name: text(fd, 'name'),
      age: text(fd, 'age'),
      lastSeenLocation: text(fd, 'lastSeenLocation'),
      notes: text(fd, 'notes'),
      contact: text(fd, 'contact'),
    });
    if (!r.ok) {
      if (r.reason === 'invalid')
        return {
          fields: r.fields as Record<string, string>,
          message: 'Check the highlighted fields.',
        };
      return { message: r.reason === 'forbidden' ? FORBIDDEN : 'That record no longer exists.' };
    }
    refresh();
    return { ok: true, message: r.changed.length ? 'Details updated.' : 'Nothing changed.' };
  } catch (err) {
    console.error('adminEditAction failed', err);
    return { message: SERVER_ERROR };
  }
}

export async function adminReopenAction(
  id: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();
  if (!admin.ok) return { message: admin.reason === 'signed_out' ? SIGN_IN : FORBIDDEN };
  try {
    const r = await reopenMissing(
      getDb(),
      { userId: admin.userId, isAdmin: true },
      id,
      text(fd, 'reason'),
    );
    refresh();
    if (r.ok) return { ok: true, message: 'Record re-opened.' };
    const msg = {
      invalid: 'Give a reason (3 to 500 characters).',
      forbidden: FORBIDDEN,
      not_found: 'That record no longer exists.',
      already_missing: 'That record is already marked as missing.',
    } as const;
    return { message: msg[r.reason] };
  } catch (err) {
    console.error('adminReopenAction failed', err);
    return { message: SERVER_ERROR };
  }
}
