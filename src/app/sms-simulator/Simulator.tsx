'use client';

import { useRef, useState, useTransition } from 'react';
import page from '@/components/page-ui.module.css';
import { sendSimulatedSms } from './actions';
import styles from './simulator.module.css';

type Message = { from: 'me' | 'desk'; text: string };

const EXAMPLES = [
  'HELP',
  'SEARCH Maya Rai',
  'MISSING Maya Rai, Rasuwa, 34',
  'FOUND Maya Rai',
  'STATUS Kathmandu',
];

export function Simulator() {
  const [phone, setPhone] = useState('(415) 555-0132');
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  function send(text: string) {
    const body = text.trim();
    if (!body || pending) return;
    setError(null);
    setDraft('');
    setMessages((m) => [...m, { from: 'me', text: body }]);
    startTransition(async () => {
      const result = await sendSimulatedSms(phone, body);
      if (result.ok) setMessages((m) => [...m, { from: 'desk', text: result.reply }]);
      else setError(result.error);
      setTimeout(() => endRef.current?.scrollIntoView({ block: 'end' }), 0);
    });
  }

  return (
    <div className={styles.layout}>
      <section className={styles.phone} aria-label="Simulated phone">
        <div className={styles.banner}>SIMULATION - no real text is sent</div>
        <div className={styles.thread} aria-live="polite">
          {messages.length === 0 && (
            <p className={styles.empty}>Send a command, or tap an example on the right.</p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.from === 'me' ? styles.mine : styles.theirs}>
              {m.text}
            </div>
          ))}
          {pending && <div className={styles.theirs}>...</div>}
          <div ref={endRef} />
        </div>
        {error && (
          <p className={page.error} role="alert">
            {error}
          </p>
        )}
        <form
          className={styles.compose}
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <input
            className={page.input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a command"
            maxLength={500}
            aria-label="Message"
          />
          <button type="submit" className={page.button} disabled={pending || !draft.trim()}>
            Send
          </button>
        </form>
      </section>

      <aside className={styles.side}>
        <label className={page.fieldLabel} htmlFor="sim-phone">
          Pretend to be this phone (US number)
        </label>
        <input
          id="sim-phone"
          className={page.input}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={40}
          inputMode="tel"
        />
        <p className={styles.note}>
          Only the phone that reported a person can mark them FOUND. Searches show status and place
          only, never contact details, and children appear as initials.
        </p>
        <h2 className={styles.h2}>Examples</h2>
        <div className={styles.examples}>
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className={styles.example} onClick={() => send(ex)}>
              {ex}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
