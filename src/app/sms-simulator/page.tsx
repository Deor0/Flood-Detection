import type { Metadata } from 'next';
import { MessageSquareText, Phone } from 'lucide-react';
import ui from '@/components/page-ui.module.css';
import {
  COMMANDS,
  HELPLINE_KICKER,
  HELPLINE_NAME,
  PRIVACY_POINTS,
  VOICE_AGENT_NAME,
  VOICE_NUMBER,
  telHref,
} from '@/lib/helpline';
import { getViewer } from '@/lib/roles';
import { SignInLink } from '@/components/SignInLink';
import { Simulator } from './Simulator';
import styles from './simulator.module.css';

export const dynamic = 'force-dynamic';

const DESCRIPTION =
  'Search for someone, report a missing person, or mark them found by phone call or text message, with no internet. Practise both here first.';

export const metadata: Metadata = {
  title: `${HELPLINE_NAME} · ${HELPLINE_KICKER}`,
  description: DESCRIPTION,
  openGraph: {
    title: `${HELPLINE_NAME} (${HELPLINE_KICKER}): call or text when the internet is down`,
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
    title: 'The beacon receives it',
    text: `${VOICE_AGENT_NAME}, the voice agent, listens to your call. A text goes to our receiving phone, which is online and passes it on like a signal fire.`,
  },
  {
    title: 'The registry updates',
    text: 'Searches read the same missing persons registry as this site. Reports appear here at once.',
  },
  {
    title: 'You get an answer',
    text: `${VOICE_AGENT_NAME} tells you, or a reply text comes back, usually within a few seconds.`,
  },
] as const;

export default async function HelplinePage() {
  const viewer = await getViewer();
  return (
    <main className={ui.page}>
      <div className={ui.header}>
        <div>
          <p className={styles.kicker}>{HELPLINE_KICKER}</p>
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
          <span className={`${styles.status} ${VOICE_NUMBER ? styles.statusLive : ''}`}>
            {VOICE_NUMBER ? 'Live' : 'Number coming soon'}
          </span>
          {VOICE_NUMBER && (
            <p className={styles.number}>
              <a href={telHref(VOICE_NUMBER)}>{VOICE_NUMBER}</a>
            </p>
          )}
          <p>
            Talk to {VOICE_AGENT_NAME}, our AI voice agent, in plain words. {VOICE_AGENT_NAME} can:
          </p>
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
          Try the text commands, or walk through a call with {VOICE_AGENT_NAME}, the voice agent.
          Both use the real registry, so the answers match what a phone would get. Nothing is sent
          to any phone.
        </p>
        {viewer.userId ? (
          <Simulator />
        ) : (
          <div className={styles.signedOut}>
            <p>
              Practice texts and calls file real records, so the practice phone is for signed-in
              volunteers. Everything else on this page is open to all.
            </p>
            <SignInLink to="practise" />
          </div>
        )}
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
          Commands are not case sensitive, and a small typo is fine (SERCH works). FIND, LOST and
          SAFE also work, as do KHOJ, HARAYO and BHETIYO. Separate the parts of a report with
          commas.
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
            Sending the same report twice by mistake files it once. When someone marks a person you
            reported as found, your next text starts with the good news.
          </li>
          <li>
            Replies are plain text, at most 320 characters. River status by text uses saved,
            simulated river data for a few places. It is an educational simulation, not an official
            forecast. If water is rising, go to higher ground.
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
