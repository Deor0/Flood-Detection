import type { Metadata } from 'next';
import { MessageSquareText, Phone } from 'lucide-react';
import ui from '@/components/page-ui.module.css';
import { COMMANDS, HELPLINE_NAME, PRIVACY_POINTS, VOICE_NUMBER, telHref } from '@/lib/helpline';
import { Simulator } from './Simulator';
import styles from './simulator.module.css';

export const dynamic = 'force-dynamic';

const DESCRIPTION =
  'Search for someone, report a missing person, or mark them found by phone call or text message, with no internet. Practise both here first.';

export const metadata: Metadata = {
  title: `${HELPLINE_NAME} · Flood Response`,
  description: DESCRIPTION,
  openGraph: {
    title: `${HELPLINE_NAME}: call or text when the internet is down`,
    description: DESCRIPTION,
    type: 'website',
  },
};

const STEPS = [
  {
    title: 'You call or text',
    text: 'From any phone, smartphone or basic. Mobile data is not needed, only a phone signal.',
  },
  {
    title: 'The helpline receives it',
    text: 'The voice agent listens to your call. A text goes to our receiving phone, which is online.',
  },
  {
    title: 'The registry updates',
    text: 'Searches read the same missing persons registry as this site. Reports appear here at once.',
  },
  {
    title: 'You get an answer',
    text: 'The agent tells you, or a reply text comes back, usually within a few seconds.',
  },
] as const;

export default function HelplinePage() {
  return (
    <main className={ui.page}>
      <div className={ui.header}>
        <div>
          <h1 className={ui.title}>{HELPLINE_NAME}</h1>
          <p className={ui.lede}>
            When the internet is down, a phone call or a text still gets through. Look for a family
            member, report someone missing, or tell us they are safe, and it shows up in this
            registry for everyone searching.
          </p>
        </div>
      </div>

      <ul className={styles.channels} aria-label="Ways to reach the helpline">
        <li className={styles.channel}>
          <div className={styles.channelHead}>
            <span className={styles.channelIcon}>
              <Phone size={20} aria-hidden="true" />
            </span>
            <h2>Call the voice line</h2>
          </div>
          <span className={`${styles.status} ${styles.statusLive}`}>Live</span>
          {VOICE_NUMBER && (
            <p className={styles.number}>
              <a href={telHref(VOICE_NUMBER)}>{VOICE_NUMBER}</a>
            </p>
          )}
          <p>Talk to an AI voice agent in plain words. It can:</p>
          <ul>
            <li>check whether a person is listed as missing or found</li>
            <li>file a missing person report (name, last place seen, age)</li>
          </ul>
          <p>No app, no data plan, no account.</p>
        </li>
        <li className={styles.channel}>
          <div className={styles.channelHead}>
            <span className={styles.channelIcon}>
              <MessageSquareText size={20} aria-hidden="true" />
            </span>
            <h2>Text a command</h2>
          </div>
          <span className={`${styles.status} ${styles.statusLive}`}>Live pilot</span>
          <p>Works on any basic phone. Send one short command, get one reply:</p>
          <ul>
            <li>
              <code>SEARCH Maya Rai</code> to look someone up
            </li>
            <li>
              <code>MISSING Maya Rai, Rasuwa, 34</code> to report them
            </li>
            <li>
              <code>FOUND Maya Rai</code> when they are safe
            </li>
          </ul>
          <p>
            The text line is running as a pilot with a small group of phones. The public number will
            be listed here when it opens to everyone.
          </p>
        </li>
      </ul>

      <section className={styles.section} aria-labelledby="practise-title">
        <h2 id="practise-title" className={styles.sectionTitle}>
          Practise here first
        </h2>
        <p className={styles.sectionLede}>
          Try the text commands, or walk through a call with the voice agent. Both use the real
          registry, so the answers match what a phone would get. Nothing is sent to any phone.
        </p>
        <Simulator />
      </section>

      <section className={styles.section} aria-labelledby="how-title">
        <h2 id="how-title" className={styles.sectionTitle}>
          How it works without internet
        </h2>
        <p className={styles.sectionLede}>
          Calls and texts travel over the ordinary phone network, which often keeps working when
          mobile data and Wi-Fi are down.
        </p>
        <ol className={styles.steps}>
          {STEPS.map((step) => (
            <li key={step.title} className={styles.step}>
              <strong>{step.title}</strong>
              <span>{step.text}</span>
            </li>
          ))}
        </ol>
        <p className={styles.sectionLede} style={{ marginTop: '1rem' }}>
          If no reply comes within a minute, send the text again. A text that arrives while the
          helpline is offline is not answered later.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="commands-title">
        <h2 id="commands-title" className={styles.sectionTitle}>
          Every command
        </h2>
        <p className={styles.sectionLede}>
          Commands are not case sensitive. Separate the parts of a report with commas.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Text</th>
                <th scope="col">On a call, say</th>
                <th scope="col">What it does</th>
                <th scope="col">Example reply</th>
              </tr>
            </thead>
            <tbody>
              {COMMANDS.map((c) => (
                <tr key={c.sms}>
                  <td>
                    <code>{c.sms}</code>
                  </td>
                  <td>{c.voice ?? <span className={styles.muted}>Text only</span>}</td>
                  <td>{c.does}</td>
                  <td className={styles.reply}>{c.reply}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="privacy-title">
        <h2 id="privacy-title" className={styles.sectionTitle}>
          Privacy and limits
        </h2>
        <ul className={styles.points}>
          {PRIVACY_POINTS.map((point) => (
            <li key={point}>{point}</li>
          ))}
          <li>
            Replies are plain text, at most 320 characters. River status by text points you to the
            web flood desk, which is an educational simulation, not an official forecast.
          </li>
          <li>
            The helpline does not replace emergency services. If someone is in danger now, call your
            local emergency number.
          </li>
        </ul>
      </section>
    </main>
  );
}
