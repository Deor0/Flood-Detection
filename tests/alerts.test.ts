import { describe, expect, it } from 'vitest';
import { canSendAlert } from '@/core/permissions';
import { advanceAlert, buildAlertMessage, type FloodAlert } from '@/core/alerts/state';

const admin = { userId: 'user_admin', isAdmin: true };
const member = { userId: 'user_member', isAdmin: false };

function alert(overrides: Partial<FloodAlert> = {}): FloodAlert {
  return {
    id: 'alert_1',
    kind: 'simulated',
    place: 'Kathmandu',
    lat: 27.7,
    lng: 85.32,
    severity: 'warning',
    returnPeriod: 8,
    status: 'detected',
    ...overrides,
  };
}

describe('alert copy', () => {
  it('labels a simulation, stays plain, and uses a more cautious line when history is unknown', () => {
    const message = buildAlertMessage({
      place: 'Kathmandu',
      severity: 'warning',
      returnPeriod: 8,
      capped: false,
      peakDate: '2026-08-26',
      simulated: true,
    });
    for (const text of [message.sms, message.voiceScript]) {
      expect(text.startsWith('SIMULATION ONLY:')).toBe(true);
      expect(text).toContain('Kathmandu');
      expect(text).toContain('warning');
      expect(text.toLowerCase()).toContain('move away from rivers and low ground');
      expect(text).toMatch(/^[\x00-\x7F]*$/);
      expect(text).not.toMatch(/WEA|NWS|Wireless Emergency Alert/i);
    }
    expect(message.sms.length).toBeLessThanOrEqual(320);

    const unknown = buildAlertMessage({
      place: 'Kathmandu',
      severity: 'unknown',
      returnPeriod: null,
      capped: false,
      peakDate: null,
      simulated: true,
    });
    expect(unknown.sms).not.toBe(message.sms);
    expect(unknown.sms.toLowerCase()).toContain('not enough');
  });
});

describe('alert state machine', () => {
  it('lets only an admin move one step at a time, and refuses a real send', () => {
    expect(canSendAlert(admin)).toBe(true);
    expect(canSendAlert(member)).toBe(false);

    expect(advanceAlert(alert(), 'notified', admin)).toEqual({ ok: false, reason: 'out_of_order' });
    expect(advanceAlert(alert(), 'verified', member)).toEqual({ ok: false, reason: 'forbidden' });

    const verified = advanceAlert(alert(), 'verified', admin);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.alert.status).toBe('verified');
    expect(verified.event.kind).toBe('verified');

    const real = advanceAlert(alert({ kind: 'real', status: 'verified' }), 'notified', admin);
    expect(real).toEqual({ ok: false, reason: 'real_sends_disabled' });

    const notified = advanceAlert(verified.alert, 'notified', admin);
    expect(notified.ok).toBe(true);
    if (!notified.ok) return;
    const done = advanceAlert(notified.alert, 'acknowledged', admin);
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(advanceAlert(done.alert, 'verified', admin)).toEqual({ ok: false, reason: 'closed' });
  });
});
