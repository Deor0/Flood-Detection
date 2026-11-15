'use client';

import { useState } from 'react';
import { buildAlertMessage, type AlertStatus } from '@/core/alerts/state';
import { advanceAlertAction, createSimulatedAlertAction } from './actions';
import type { Severity } from './types';
import styles from './dashboard.module.css';

type Props = {
  isAdmin: boolean;
  place: string;
  lat: number;
  lng: number;
  severity: Severity;
  returnPeriod: number | null;
  capped: boolean;
  peakDate: string | null;
};

const NEXT: Partial<Record<AlertStatus, AlertStatus>> = {
  detected: 'verified',
  verified: 'notified',
  notified: 'acknowledged',
};
const STEP_LABEL: Record<AlertStatus, string> = {
  detected: 'Detected',
  verified: 'Verify',
  notified: 'Simulate notification',
  acknowledged: 'Mark acknowledged',
};

/** SIMULATION: shows the exact text that would go out. Nothing is ever sent to anyone. */
export function AlertPanel(props: Props) {
  const { isAdmin, place, lat, lng, severity, returnPeriod, capped, peakDate } = props;
  const [alert, setAlert] = useState<{ id: string; status: AlertStatus } | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  if (severity === 'normal') return null; // nothing to warn about: no preview, no record button

  const text = buildAlertMessage({
    place,
    severity,
    returnPeriod,
    capped,
    peakDate,
    simulated: true,
  });
  const next = alert ? NEXT[alert.status] : undefined;

  async function run(
    job: () => Promise<
      { ok: true; id: string; status: AlertStatus } | { ok: false; reason: string }
    >,
  ) {
    setBusy(true);
    setMessage('');
    try {
      const result = await job();
      if (result.ok) setAlert({ id: result.id, status: result.status });
      else setMessage(`Not done: ${result.reason.replace(/_/g, ' ')}.`);
    } catch {
      setMessage('Something went wrong. Nothing was sent.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.alertBox} aria-label="Simulated alert">
      <div className={styles.headline}>
        <h3 className={styles.h3}>Alert preview</h3>
        <span className={styles.badgeSim}>SIMULATION</span>
      </div>
      <div className={styles.phones}>
        <div className={styles.phone}>
          <strong>SMS</strong>
          <p>{text.sms}</p>
        </div>
        <div className={styles.phone}>
          <strong>Voice script</strong>
          <p>{text.voiceScript}</p>
        </div>
      </div>
      <p className={styles.muted}>Shown on screen only. No SMS, call or message is sent.</p>
      {isAdmin && (
        <div className={styles.alertActions}>
          {!alert ? (
            <button
              type="button"
              className={styles.action}
              disabled={busy}
              onClick={() =>
                run(() => createSimulatedAlertAction({ place, lat, lng, severity, returnPeriod }))
              }
            >
              Record simulated alert
            </button>
          ) : (
            <>
              <span>Status: {alert.status}</span>
              {next && (
                <button
                  type="button"
                  className={styles.action}
                  disabled={busy}
                  onClick={() => run(() => advanceAlertAction(alert.id, next))}
                >
                  {STEP_LABEL[next]}
                </button>
              )}
            </>
          )}
          {message && <span className={styles.error}>{message}</span>}
        </div>
      )}
    </section>
  );
}
