'use client';

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import { Phone, PhoneOff, Volume2, VolumeX } from 'lucide-react';
import page from '@/components/page-ui.module.css';
import { sendSimulatedSms } from './actions';
import styles from './simulator.module.css';

type Line = { who: 'agent' | 'caller'; text: string };

/**
 * The voice agent's script, run in the browser. Checks and reports go through the same simulator
 * action as the text tab (SEARCH / MISSING), so the answers match the real registry.
 */
type Step =
  | { kind: 'idle' }
  | { kind: 'menu' }
  | { kind: 'checkName' }
  | { kind: 'reportName' }
  | { kind: 'reportPlace'; name: string }
  | { kind: 'reportAge'; name: string; place: string }
  | { kind: 'ended' };

const GREETING =
  'Flood helpline. This call is a simulation. Are you looking for someone, or reporting someone missing?';
const ANYTHING_ELSE =
  'Is there anything else? You can look for someone, report someone, or hang up.';

/** Commas split the SMS fields, so they cannot appear inside one. */
function field(text: string): string {
  return text.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
}

function intentOf(text: string): 'check' | 'report' | 'end' | null {
  const t = text.toLowerCase();
  if (/\b(bye|hang ?up|no(thing)?( else)?|that'?s all|done)\b/.test(t)) return 'end';
  if (/\b(report|missing|lost|can'?t find|cannot find)\b/.test(t)) return 'report';
  if (/\b(look|looking|search|check|find|is .* (on|in) the list|status)\b/.test(t)) return 'check';
  return null;
}

const noSubscribe = () => () => {};

function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function CallSimulator({ phone }: { phone: string }) {
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  // false on the server and during hydration, then the browser's real answer.
  const canSpeak = useSyncExternalStore(noSubscribe, speechAvailable, () => false);
  const [speak, setSpeak] = useState(false);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const speakRef = useRef(speak);

  const live = step.kind !== 'idle' && step.kind !== 'ended';

  // Replies arrive after an await; read the toggle's current value, not the one from that render.
  useEffect(() => {
    speakRef.current = speak;
  }, [speak]);

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [live]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lines, pending]);

  useEffect(
    () => () => {
      if (speechAvailable()) window.speechSynthesis.cancel();
    },
    [],
  );

  function say(text: string) {
    setLines((l) => [...l, { who: 'agent', text }]);
    if (speakRef.current && speechAvailable()) {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    }
  }

  function hear(text: string) {
    setLines((l) => [...l, { who: 'caller', text }]);
  }

  function start() {
    setLines([]);
    setError(null);
    setSeconds(0);
    setStep({ kind: 'menu' });
    say(GREETING);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function hangUp() {
    if (speechAvailable()) window.speechSynthesis.cancel();
    if (live) hear('(hangs up)');
    setStep({ kind: 'ended' });
  }

  function choose(intent: 'check' | 'report') {
    if (intent === 'check') {
      setStep({ kind: 'checkName' });
      say('Who are you looking for? Please say their full name.');
    } else {
      setStep({ kind: 'reportName' });
      say("I can file a report. What is the missing person's full name?");
    }
  }

  function run(command: string, onReply: (reply: string) => void) {
    setError(null);
    startTransition(async () => {
      const result = await sendSimulatedSms(phone, command);
      if (result.ok) onReply(result.reply);
      else setError(result.error);
    });
  }

  function answer(raw: string, opts: { skip?: boolean } = {}) {
    const text = raw.trim();
    if (pending || !live) return;
    if (!text && !opts.skip) return;
    setDraft('');
    hear(opts.skip ? '(skips)' : text);

    switch (step.kind) {
      case 'menu': {
        const intent = intentOf(text);
        if (intent === 'end') {
          say('Thank you for calling. Stay safe.');
          setStep({ kind: 'ended' });
        } else if (intent) {
          choose(intent);
        } else {
          say(
            'Sorry, I did not catch that. Are you looking for someone, or reporting someone missing?',
          );
        }
        return;
      }
      case 'checkName': {
        const name = field(text);
        if (!name) return say('Please say a name.');
        say(`Let me check the registry for ${name}.`);
        run(`SEARCH ${name}`, (reply) => {
          say(reply);
          say(ANYTHING_ELSE);
          setStep({ kind: 'menu' });
        });
        return;
      }
      case 'reportName': {
        const name = field(text);
        if (!name) return say('Please say their full name.');
        setStep({ kind: 'reportPlace', name });
        say(`Where was ${name} last seen? You can skip this.`);
        return;
      }
      case 'reportPlace': {
        const place = opts.skip ? '' : field(text);
        setStep({ kind: 'reportAge', name: step.name, place });
        say('How old are they? You can skip this too.');
        return;
      }
      case 'reportAge': {
        const age = opts.skip ? '' : field(text);
        const { name, place } = step;
        say('Thank you. Filing the report now.');
        run(`MISSING ${name}, ${place}, ${age}`, (reply) => {
          say(reply);
          say(ANYTHING_ELSE);
          setStep({ kind: 'menu' });
        });
        return;
      }
    }
  }

  const skippable = step.kind === 'reportPlace' || step.kind === 'reportAge';
  const minutes = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <section className={styles.phone} aria-label="Simulated voice call">
      <div className={styles.banner}>Simulated call · nothing is dialed</div>
      <div className={styles.callHead}>
        <div>
          <strong>Flood helpline</strong>
          <span>
            {live ? `On call · ${minutes}` : step.kind === 'ended' ? 'Call ended' : 'Voice agent'}
          </span>
        </div>
        {canSpeak && (
          <button
            type="button"
            className={styles.speakToggle}
            aria-pressed={speak}
            onClick={() => {
              if (speak && speechAvailable()) window.speechSynthesis.cancel();
              setSpeak(!speak);
            }}
          >
            {speak ? (
              <Volume2 size={16} aria-hidden="true" />
            ) : (
              <VolumeX size={16} aria-hidden="true" />
            )}
            Read aloud
          </button>
        )}
      </div>

      <div className={styles.thread} aria-live="polite">
        {step.kind === 'idle' && (
          <div className={styles.callStart}>
            <p className={styles.empty}>
              Practise calling the voice agent. It can check on someone or file a report.
            </p>
            <button type="button" className={styles.callButton} onClick={start}>
              <Phone size={18} aria-hidden="true" /> Start call
            </button>
          </div>
        )}
        {lines.map((line, i) => (
          <div key={i} className={line.who === 'caller' ? styles.mine : styles.theirs}>
            <span className={styles.speaker}>{line.who === 'caller' ? 'You' : 'Agent'}</span>
            {line.text}
          </div>
        ))}
        {pending && <div className={styles.theirs}>...</div>}
        {step.kind === 'ended' && (
          <div className={styles.callStart}>
            <p className={styles.empty}>
              Found someone you reported? Text <code>FOUND &lt;name&gt;</code> from the same phone.
            </p>
            <button type="button" className={styles.callButton} onClick={start}>
              <Phone size={18} aria-hidden="true" /> Call again
            </button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <p className={page.error} role="alert">
          {error}
        </p>
      )}

      {step.kind === 'menu' && !pending && (
        <div className={styles.examples} aria-label="Quick answers">
          <button
            type="button"
            className={styles.example}
            onClick={() => {
              hear('I am looking for someone.');
              choose('check');
            }}
          >
            I am looking for someone
          </button>
          <button
            type="button"
            className={styles.example}
            onClick={() => {
              hear('I want to report someone missing.');
              choose('report');
            }}
          >
            Report someone missing
          </button>
        </div>
      )}

      {live && (
        <form
          className={styles.compose}
          onSubmit={(e) => {
            e.preventDefault();
            answer(draft);
          }}
        >
          <input
            ref={inputRef}
            className={page.input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type what you would say"
            maxLength={200}
            aria-label="What you say"
            disabled={pending}
          />
          {skippable ? (
            <button
              type="button"
              className={page.buttonLight}
              onClick={() => answer('', { skip: true })}
              disabled={pending}
            >
              Skip
            </button>
          ) : null}
          <button type="submit" className={page.button} disabled={pending || !draft.trim()}>
            Say
          </button>
          <button
            type="button"
            className={styles.hangUp}
            onClick={hangUp}
            aria-label="Hang up"
            title="Hang up"
          >
            <PhoneOff size={18} aria-hidden="true" />
          </button>
        </form>
      )}
    </section>
  );
}
