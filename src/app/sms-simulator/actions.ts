'use server';

import { getDb } from '@/db';
import { handleInboundSms } from '@/core/sms';
import { getViewer } from '@/lib/roles';

export type SimulatorResult = { ok: true; reply: string } | { ok: false; error: string };

/** Runs one simulated text through the real SMS core. Nothing is sent to any phone. */
export async function sendSimulatedSms(from: string, body: string): Promise<SimulatorResult> {
  const viewer = await getViewer();
  if (!viewer.userId) return { ok: false, error: 'Your session ended. Sign in again to continue.' };
  const text = String(body ?? '').slice(0, 500);
  if (!text.trim()) return { ok: false, error: 'Type a message first.' };
  try {
    const result = await handleInboundSms(getDb(), {
      from: String(from ?? '').slice(0, 40),
      body: text,
      receivedAt: new Date(),
    });
    return { ok: true, reply: result.reply };
  } catch (err) {
    console.error('sms simulator failed', err);
    return { ok: false, error: 'Something went wrong on our side. Try again in a moment.' };
  }
}
