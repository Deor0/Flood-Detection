'use client';

import { useRef, useState, useTransition } from 'react';
import { MessageSquareText, Phone } from 'lucide-react';
import page from '@/components/page-ui.module.css';
import { sendSimulatedSms } from './actions';
import { CallSimulator } from './CallSimulator';
import styles from './simulator.module.css';

type Message = { from: 'me' | 'desk'; text: string };
type Mode = 'text' | 'call';

const EXAMPLES = [
  'HELP',
  'SEARCH Maya Rai',
  'MISSING Maya Rai, Rasuwa, 34',
  'FOUND Maya Rai',
  'STATUS Kathmandu',
];

export function Simulator() {
  const [mode, setMode] = useState<Mode>('text');
  const [phone, setPhone] = useState('(415) 555-0132');

  return (
    <div className={styles.layout}>
      <div className={styles.device}>
        <div className={styles.tabs} role="tablist" aria-label="Choose how to reach the helpline">
          <button
            type="button"
            role="tab"
            id="tab-text"
            aria-controls="panel-text"
            aria-selected={mode === 'text'}
            className={`${styles.tab} ${mode === 'text' ? styles.tabActive : ''}`}
            onClick={() => setMode('text')}
          >
            <MessageSquareText size={16} aria-hidden="true" /> Text
          </button>
          <button
            type="button"
            role="tab"
            id="tab-call"
            aria-controls="panel-call"
            aria-selected={mode === 'call'}
            className={`${styles.tab} ${mode === 'call' ? styles.tabActive : ''}`}
            onClick={() => setMode('call')}
          >
            <Phone size={16} aria-hidden="true" /> Call
          </button>
        </div>
        {/* Both stay mounted so switching tabs keeps each conversation. */}
        <div role="tabpanel" id="panel-text" aria-labelledby="tab-text" hidden={mode !== 'text'}>
          <TextSimulator phone={phone} />
        </div>
        <div role="tabpanel" id="panel-call" aria-labelledby="tab-call" hidden={mode !== 'call'}>
          <CallSimulator phone={phone} />
        </div>
      </div>

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
          The registry remembers which phone filed each report. Only that phone can mark the person
          FOUND by text, so keep the same number while you practise.
        </p>
        {mode === 'text' ? (
          <p className={styles.note}>
            Type a command, or tap an example. Replies are the same ones a real phone gets.
          </p>
        ) : (
          <p className={styles.note}>
            The call version walks you through the same questions the voice agent asks. Type what
            you would say. Turn on <strong>Read aloud</strong> to hear the agent.
          </p>
        )}
        <p className={styles.warning}>
          Reports you file here are real records in the registry. Use test names, such as
          &ldquo;Test Person&rdquo;.
        </p>
      </aside>
    </div>
  );
}

function TextSimulator({ phone }: { phone: string }) {
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
    <section className={styles.phone} aria-label="Simulated text messages">
      <div className={styles.banner}>Simulation · no real text is sent</div>
      <div className={styles.thread} aria-live="polite">
        {messages.length === 0 && (
          <p className={styles.empty}>Send a command, or tap an example below.</p>
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
      <div className={styles.examples} aria-label="Example commands">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            className={styles.example}
            onClick={() => send(ex)}
            disabled={pending}
          >
            {ex}
          </button>
        ))}
      </div>
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
  );
}
