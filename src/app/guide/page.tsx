import Link from 'next/link';
import { HelplineNote } from '@/components/HelplineNote';
import {
  APP_LINKS,
  CARE_NOTES,
  CHECKED_ON,
  EMERGENCY_NUMBERS,
  MOUNTAIN_TIPS,
  PHASES,
  SOURCES,
  WATER_DEPTHS,
  WHY_IT_MATTERS,
  type Stat,
  type Tip,
} from './guide-content';
import { GuideVideo } from './GuideVideo';
import styles from './guide.module.css';

export const metadata = {
  title: "Flood Guide (Circe's Chart): what to do during, before and after a flood",
  description:
    'Short, sourced steps for during, before and after a flood, mountain floods (GLOFs and debris flows), and how to use this app when it happens.',
};

const sourceById = new Map(SOURCES.map((source) => [source.id, source]));

function Cite({ id }: { id?: string }) {
  const source = id ? sourceById.get(id) : undefined;
  if (!source) return null;
  return (
    <span className={styles.cite}>
      {' '}
      (<a href={source.url}>{source.name.split(':')[0]}</a>)
    </span>
  );
}

function TipItem({ tip }: { tip: Tip }) {
  return (
    <li className={styles.tip}>
      {tip.text}
      <Cite id={tip.source} />
      {tip.why && <span className={styles.why}>{tip.why}</span>}
    </li>
  );
}

function StatList({ items, label }: { items: Stat[]; label: string }) {
  return (
    <ul className={styles.stats} aria-label={label}>
      {items.map((item) => (
        <li key={item.value} className={styles.stat}>
          <span className={styles.statValue}>{item.value}</span>
          <span className={styles.statLabel}>
            {item.label}
            <Cite id={item.source} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function GuidePage() {
  return (
    <main className={styles.page}>
      <p className={styles.kicker}>Circe&apos;s Chart</p>
      <h1 className={styles.title}>Flood Guide</h1>
      <p className={styles.lede}>
        What to do during, before and after a flood, with the urgent steps first. Short steps,
        checked against public safety sources. This is general guidance, not an official warning.
        Follow your local authorities.
      </p>
      <div className={styles.danger} role="note" aria-label="Emergency numbers">
        <p className={styles.dangerLine}>In an emergency, call first. Do not wait for this app.</p>
        <ul className={styles.callList}>
          {EMERGENCY_NUMBERS.map((entry) => (
            <li key={entry.tel}>
              {entry.place}:{' '}
              <a className={styles.call} href={`tel:${entry.tel}`}>
                {entry.label}
              </a>
            </li>
          ))}
          <li>Anywhere else: your local emergency number.</li>
        </ul>
      </div>
      <p className={`${styles.note} ${styles.offline}`}>
        <strong>Save this page for offline.</strong> While you still have signal, save it in your
        browser or print it (Print to PDF works). Printing gives a one-page card of the
        &ldquo;During&rdquo; steps.
      </p>

      <ol className={styles.phases} aria-label="Flood safety by phase, most urgent first">
        {PHASES.map((phase) => (
          <li
            key={phase.id}
            id={phase.id}
            className={`${styles.phase} ${phase.id === 'during' ? styles.urgent : ''}`}
          >
            <div className={styles.phaseHead}>
              <h2 className={styles.phaseTitle}>{phase.title}</h2>
              <p className={styles.phaseTheme}>{phase.theme}</p>
              <p className={styles.phaseLead}>{phase.lead}</p>
            </div>
            <ul className={styles.tips}>
              {phase.tips.map((tip) => (
                <TipItem key={tip.text} tip={tip} />
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <section id="mountain" className={styles.section} aria-labelledby="mountain-title">
        <h2 id="mountain-title" className={styles.sectionTitle}>
          Mountain floods: GLOF and debris flows
        </h2>
        <p className={styles.note}>
          In steep valleys a glacial lake outburst flood (GLOF) or a debris flow can arrive in
          minutes, carrying mud and boulders. River gauges may show nothing first.
        </p>
        <ul className={styles.plain}>
          {MOUNTAIN_TIPS.map((tip) => (
            <li key={tip.text}>
              {tip.text}
              <Cite id={tip.source} />
              {tip.why && <span className={styles.why}>{tip.why}</span>}
            </li>
          ))}
        </ul>
        <p className={styles.note}>
          See how this played out in Rasuwa: <Link href="/nepal">Nepal, 26 August 2026</Link>.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="water-title">
        <h2 id="water-title" className={styles.sectionTitle}>
          Vehicles and water
        </h2>
        <p className={styles.phaseTheme}>Tie yourself to the mast</p>
        <p className={styles.note}>
          Turn Around, Don&apos;t Drown. The Sirens&apos; song here is the urge to drive into
          &ldquo;only a little&rdquo; water. Decide now, before the storm, that you will turn
          around.
        </p>
        <StatList items={WATER_DEPTHS} label="Water depth and danger" />
        <p className={styles.note}>
          Depths for vehicles differ a little between sources (the Red Cross says 12 inches can
          carry a vehicle away), and water may be deeper than it looks. The safe rule is the same
          everywhere: turn around, do not drive or walk into floodwater.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="care-title">
        <h2 id="care-title" className={styles.sectionTitle}>
          Children and pets
        </h2>
        <ul className={styles.plain}>
          {CARE_NOTES.map((tip) => (
            <li key={tip.text}>
              {tip.text}
              <Cite id={tip.source} />
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="why-title">
        <h2 id="why-title" className={styles.sectionTitle}>
          Why early warning matters
        </h2>
        <StatList items={WHY_IT_MATTERS} label="Early warning figures" />
      </section>

      <section className={styles.section} aria-labelledby="app-title">
        <h2 id="app-title" className={styles.sectionTitle}>
          Using this app in a flood
        </h2>
        <ul className={styles.appGrid}>
          {APP_LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className={styles.appLink}>
                <strong>{link.title}</strong>
                <span>{link.text}</span>
              </Link>
            </li>
          ))}
        </ul>
        <HelplineNote heading="When phones have no data" />
        <p className={styles.note}>
          The flood desk is an educational simulation. It does not send real alerts, and nothing
          here replaces your local authorities or emergency services.
        </p>
      </section>

      <div className={styles.section}>
        <GuideVideo />
      </div>

      <section className={styles.section} aria-labelledby="sources-title">
        <h2 id="sources-title" className={styles.sectionTitle}>
          Sources
        </h2>
        <ol className={styles.sources}>
          {SOURCES.map((source) => (
            <li key={source.id}>
              <a href={source.url}>{source.name}</a>. {source.note} Checked {CHECKED_ON}.
            </li>
          ))}
          <li>
            <a href="https://www.nepalpolice.gov.np/stations/emergency-contacts/">
              Nepal Police: Emergency contacts
            </a>
            . Police control: 100. Checked {CHECKED_ON}.
          </li>
          <li>
            <a
              href="https://www.youtube.com/watch?v=rV1iqRD9EKY"
              target="_blank"
              rel="noopener noreferrer"
            >
              How to Survive a Flood (video, How to Survive Show)
            </a>
            . Third-party video, not reviewed or endorsed by this app.
          </li>
        </ol>
      </section>
    </main>
  );
}
