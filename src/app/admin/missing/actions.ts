'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import {
  approveEditRequest,
  editMissing,
  rejectEditRequest,
  reopenMissing,
} from '@/core/missing/service';
import { bulkReopenFoundBy, previewFoundBy, validFilter } from '@/core/admin/bulkReopen';
import { composeReason } from '@/core/admin/reasons';
import { publicId } from '@/core/missing/names';
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
      composeReason('edit', text(fd, 'reasonTemplate'), text(fd, 'reason')),
    );
    refresh();
    if (r.ok) return { ok: true, message: 'Rejected.' };
    return {
      message:
        r.reason === 'invalid'
          ? 'Pick a common reason or write one (3 to 500 characters).'
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

export type BulkState = FormState & {
  /** Set after a preview: what a confirmed run would re-open. */
  preview?: { names: string[]; foundBy: string; since: string; reason: string };
};

/**
 * Bulk re-open of records falsely marked found. Two steps: `mode=preview` lists the matches
 * (read-only); `mode=confirm` re-opens them, each through the normal re-open path.
 */
export async function bulkReopenAction(_prev: BulkState, fd: FormData): Promise<BulkState> {
  const admin = await requireAdmin();
  if (!admin.ok) return { message: admin.reason === 'signed_out' ? SIGN_IN : FORBIDDEN };
  const foundBy = text(fd, 'foundBy').trim();
  const sinceRaw = text(fd, 'since').trim();
  // datetime-local has no zone; the form says the time is UTC.
  const since = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(sinceRaw) ? sinceRaw : `${sinceRaw}Z`);
  const reason = text(fd, 'reason').trim();
  if (!validFilter({ foundBy, since }))
    return { message: 'Enter a Clerk user id (user_…) or a phone in +1… form, and a start time.' };
  if (reason.length < 3 || reason.length > 480)
    return { message: 'Give a reason (3 to 480 characters).' };
  try {
    if (text(fd, 'mode') !== 'confirm') {
      const items = await previewFoundBy(getDb(), { foundBy, since });
      if (items.length === 0) return { message: 'No found records match. Nothing would change.' };
      return {
        preview: {
          names: items.map((i) => `${i.name} (#${publicId(i.publicNumber)})`),
          foundBy,
          since: since.toISOString(),
          reason,
        },
      };
    }
    const r = await bulkReopenFoundBy(
      getDb(),
      { userId: admin.userId, isAdmin: true },
      { foundBy, since, reason },
    );
    refresh();
    if (r.ok)
      return {
        ok: true,
        message: `Re-opened ${r.reopened.length} record${r.reopened.length === 1 ? '' : 's'}. Each one logs the reason in its history.`,
      };
    return {
      message:
        r.reason === 'nothing_to_reopen'
          ? 'Nothing left to re-open: someone may have done it already.'
          : r.reason === 'forbidden'
            ? FORBIDDEN
            : 'Check the fields and try again.',
    };
  } catch (err) {
    console.error('bulkReopenAction failed', err);
    return { message: `${SERVER_ERROR} Nothing was changed.` };
  }
}
