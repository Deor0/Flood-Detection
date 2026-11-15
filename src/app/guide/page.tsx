import Link from 'next/link';
import {
  APP_LINKS,
  CARE_NOTES,
  CHECKED_ON,
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
  title: 'Flood Guide: what to do before, during and after a flood',
  description:
    'Short, sourced steps for before, during and after a flood, and how to use this app when it happens.',
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
      <h1 className={styles.title}>Flood Guide</h1>
      <p className={styles.lede}>
        What to do before, during and after a flood. Short steps, checked against public safety
        sources. This is general guidance, not an official warning. Follow your local authorities.
      </p>
      <p className={styles.danger} role="note">
        In an emergency, call your local emergency number first. Do not wait for this app.
      </p>

      <GuideVideo />

      <ol className={styles.phases} aria-label="Flood safety by phase">
        {PHASES.map((phase) => (
          <li key={phase.id} className={styles.phase}>
            <div className={styles.phaseHead}>
              <h2 className={styles.phaseTitle}>{phase.title}</h2>
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

      <section className={styles.section} aria-labelledby="water-title">
        <h2 id="water-title" className={styles.sectionTitle}>
          Vehicles and water
        </h2>
        <StatList items={WATER_DEPTHS} label="Water depth and danger" />
        <p className={styles.note}>
          Depths for vehicles differ a little between National Weather Service offices, and fast
          water is more dangerous than still water. The safe rule is the same everywhere: turn
          around, do not drive or walk into floodwater.
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
        <p className={styles.note}>
          This app is an educational simulation. It does not send real alerts, and it does not
          replace your local authorities.
        </p>
      </section>

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
