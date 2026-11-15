import { canSendAlert, type Actor } from '@/core/permissions';

export type AlertStatus = 'detected' | 'verified' | 'notified' | 'acknowledged';
export type AlertSeverity = 'normal' | 'watch' | 'warning' | 'severe' | 'unknown';

export type FloodAlert = {
  id: string;
  kind: 'simulated' | 'real';
  place: string;
  lat: number;
  lng: number;
  severity: AlertSeverity;
  returnPeriod: number | null;
  status: AlertStatus;
};

export type AlertEvent = { kind: AlertStatus; actorUserId: string; message: string | null };

export type AdvanceResult =
  | { ok: true; alert: FloodAlert; event: AlertEvent }
  | { ok: false; reason: 'forbidden' | 'out_of_order' | 'real_sends_disabled' | 'closed' };

const ORDER: AlertStatus[] = ['detected', 'verified', 'notified', 'acknowledged'];

const SAFETY = 'Move away from rivers and low ground and follow local authorities.';

type MessageInput = {
  place: string;
  severity: AlertSeverity;
  returnPeriod: number | null;
  capped: boolean;
  peakDate: string | null;
  simulated: boolean;
};

function ascii(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\b(WEA|NWS)\b/gi, '')
    .replace(/Wireless Emergency Alert/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Plain-text SMS and voice script. Never claims to be official. */
export function buildAlertMessage(input: MessageInput): { sms: string; voiceScript: string } {
  const place = ascii(input.place) || 'your area';
  const prefix = input.simulated ? 'SIMULATION ONLY: ' : '';
  let detail: string;
  if (input.severity === 'unknown') {
    detail = `River level near ${place} may be rising, but there is not enough history to rate it. Be cautious.`;
  } else {
    const rp =
      input.returnPeriod === null
        ? ''
        : ` About a 1 in ${input.capped ? 'more than 40' : Math.round(input.returnPeriod)} year level.`;
    const peak = input.peakDate ? ` Peak expected ${input.peakDate}.` : '';
    detail = `Flood ${input.severity} for ${place}.${rp}${peak}`;
  }
  const sms = `${prefix}${detail} ${SAFETY}`.slice(0, 320);
  const voiceScript = `${prefix}This is a flood message. ${detail} ${SAFETY} Repeating: ${SAFETY}`;
  return { sms, voiceScript };
}

export function advanceAlert(alert: FloodAlert, to: AlertStatus, actor: Actor): AdvanceResult {
  if (!canSendAlert(actor)) return { ok: false, reason: 'forbidden' };
  const from = ORDER.indexOf(alert.status);
  if (from === ORDER.length - 1) return { ok: false, reason: 'closed' };
  if (ORDER.indexOf(to) !== from + 1) return { ok: false, reason: 'out_of_order' };
  if (to === 'notified' && alert.kind === 'real') {
    return { ok: false, reason: 'real_sends_disabled' };
  }
  return {
    ok: true,
    alert: { ...alert, status: to },
    event: { kind: to, actorUserId: actor.userId ?? '', message: null },
  };
}
