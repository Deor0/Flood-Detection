import { NextResponse } from 'next/server';
import { handleInboundSms } from '@/core/sms';
import { getDb } from '@/db';
import { allowedSenders, normalizeUsPhone, smsLineOpen } from '@/lib/phone';

const REFUSED = 'This number is not allowed to use the line.';

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ reply: 'Send JSON with from and body.' }, { status: 400 });
  }

  const record = payload as { from?: unknown; body?: unknown };
  const from = typeof record.from === 'string' ? normalizeUsPhone(record.from) : null;
  const allowed = process.env.SMS_ALLOWED_FROM;
  if (!from || (!smsLineOpen(allowed) && !allowedSenders(allowed).has(from))) {
    return NextResponse.json({ reply: REFUSED });
  }

  const body = typeof record.body === 'string' ? record.body : '';
  const result = await handleInboundSms(getDb(), { from, body, receivedAt: new Date() });
  return NextResponse.json({ reply: result.reply });
}
