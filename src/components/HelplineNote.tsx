import Link from 'next/link';
import { Phone, MessageSquareText } from 'lucide-react';
import {
  HELPLINE_KICKER,
  HELPLINE_NAME,
  HELPLINE_PATH,
  VOICE_AGENT_NAME,
  VOICE_NUMBER,
  telHref,
} from '@/lib/helpline';
import styles from './HelplineNote.module.css';

/** "No internet? Call or text" card. No state, so it never delays the page it sits on. */
export function HelplineNote({ heading = 'No internet? Call or text.' }: { heading?: string }) {
  return (
    <aside className={styles.note} aria-label={HELPLINE_NAME}>
      <div className={styles.head}>
        <p className={styles.kicker}>
          {HELPLINE_KICKER} · {HELPLINE_NAME}
        </p>
        <h2 className={styles.title}>{heading}</h2>
        <p className={styles.lede}>
          Search for someone, report a missing person, or mark them found from any phone, even with
          no data. Every report lands in this registry right away.
        </p>
      </div>
      <ul className={styles.channels}>
        <li className={styles.channel}>
          <Phone size={18} aria-hidden="true" className={styles.icon} />
          <div>
            <strong>Call the voice line</strong>
            <span>
              {VOICE_NUMBER ? (
                <a href={telHref(VOICE_NUMBER)} className={styles.number}>
                  {VOICE_NUMBER}
                </a>
              ) : (
                'Live now'
              )}
              . Tell {VOICE_AGENT_NAME}, the voice agent, who you are looking for, or who is
              missing.
            </span>
          </div>
        </li>
        <li className={styles.channel}>
          <MessageSquareText size={18} aria-hidden="true" className={styles.icon} />
          <div>
            <strong>Text a command</strong>
            <span>
              <code>SEARCH Maya Rai</code> · <code>MISSING Maya Rai, Rasuwa, 34</code> ·{' '}
              <code>FOUND Maya Rai</code>
            </span>
          </div>
        </li>
      </ul>
      <Link href={HELPLINE_PATH} className={styles.link}>
        How it works, and practise first
      </Link>
    </aside>
  );
}
