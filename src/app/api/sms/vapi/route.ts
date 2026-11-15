import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { handleVapiTools, normalizeCallerPhone, type VapiToolCall } from '@/core/helpline/vapi';

/** Vapi sends either toolCallList or toolCalls, and arguments as an object or a JSON string. */
function toolCallsFrom(message: Record<string, unknown>): VapiToolCall[] {
  const listed = message.toolCallList;
  const nested = message.toolCalls;
  const raw = Array.isArray(listed) ? listed : Array.isArray(nested) ? nested : [];
  return raw.map((item) => {
    const call = item as Record<string, unknown>;
    const fn = call.function as Record<string, unknown> | undefined;
    const name =
      typeof call.name === 'string' ? call.name : typeof fn?.name === 'string' ? fn.name : '';
    const id = typeof call.id === 'string' ? call.id : '';
    return { id, name, arguments: call.arguments !== undefined ? call.arguments : fn?.arguments };
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const message = ((body as { message?: Record<string, unknown> }).message ?? {}) as Record<
    string,
    unknown
  >;
  if (message.type !== 'tool-calls') return NextResponse.json({ ok: true });

  const call = message.call as { customer?: { number?: string } } | undefined;
  const { results } = await handleVapiTools({
    db: getDb(),
    callerPhone: normalizeCallerPhone(call?.customer?.number),
    toolCalls: toolCallsFrom(message),
  });
  return NextResponse.json({ results });
}
