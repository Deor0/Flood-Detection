import Link from 'next/link';
import NepalImpact from '../NepalImpact';
import styles from './nepal.module.css';

export const metadata = {
  title: 'Nepal, 26 August 2026 | Flood Response',
  description:
    'A sourced look at the Nepal debris flow of 26 August 2026: what happened, what a warning could have changed, and the limits of river models.',
};

const FACTS = [
  { value: '26 Aug 2026', label: 'slope failure began', source: 'GDACS 1104124' },
  {
    value: 'about 7,600',
    label: 'people in the mapped area (estimate)',
    source: 'EMSR927, 5 Oct 2026',
  },
  {
    value: '4,685',
    label: 'buildings in the mapped area (estimate)',
    source: 'EMSR927, 5 Oct 2026',
  },
  {
    value: '1,580 ha',
    label: 'affected area, across 6 mapped areas',
    source: 'EMSR927, 5 Oct 2026',
  },
] as const;

const WHY = [
  { text: 'Up to 30% less potential damage with 24 hours of warning (an estimate).', note: 1 },
  { text: '8 times higher disaster mortality where early-warning coverage is limited.', note: 2 },
  { text: 'More than half of flood deaths involve vehicles swept downstream.', note: 3 },
] as const;

const LIMITS = [
  'Educational simulation, not an official forecast or warning.',
  'Severity compares simulated river flow (GEOGloWS, or Copernicus GloFAS as a fallback) with its own 1984-present history.',
  'Depth uses an assumed bankfull depth, which you can adjust.',
  'Elevation is about 30 m resolution with errors of several metres.',
  'Landslides, debris flows and glacial-lake floods are not represented.',
  'Building and population counts are estimates.',
  'No real alert, SMS or call is ever sent; alert text is labelled SIMULATION.',
  'Phone numbers are US only for now.',
] as const;

export default function NepalPage() {
  return (
    <main className={styles.page}>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span aria-hidden="true"> / </span>
        <span>Nepal</span>
      </nav>

      <header className={styles.header}>
        <h1 className={styles.title}>Nepal, 26 August 2026</h1>
        <p className={styles.intro}>
          A rock-and-ice slope failure above the Bhote Koshi and Trishuli rivers in Rasuwa sent a
          debris flow down the valley. We remember the people who died. This page is a sourced
          record, not a game.
        </p>
        <Link href="/dashboard" className={styles.primary}>
          Open the replay
        </Link>
      </header>

      <section aria-labelledby="happened-title">
        <h2 id="happened-title" className={styles.h2}>
          What happened
        </h2>
        <dl className={styles.facts}>
          {FACTS.map((fact) => (
            <div key={fact.label} className={styles.fact}>
              <dt className={styles.label}>{fact.label}</dt>
              <dd className={styles.value}>{fact.value}</dd>
              <dd className={styles.source}>{fact.source}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.block} aria-labelledby="whatif-title">
        <h2 id="whatif-title" className={styles.h2}>
          What a warning could change
        </h2>
        <NepalImpact />
        <details className={styles.honest} open>
          <summary>What this app would not have caught</summary>
          <p>
            Our river model would <strong>not</strong> have flagged this event: it was a debris
            flow, and river and rain data show no spike. The app would have helped with a warning
            relay (admin-verified alerts, an SMS command simulator), finding people faster (the
            registry and public search) and coordination (community programs).
          </p>
        </details>
      </section>

      <section className={styles.block} aria-labelledby="why-title">
        <h2 id="why-title" className={styles.h2}>
          Why early warning matters
        </h2>
        <ul className={styles.why}>
          {WHY.map((item) => (
            <li key={item.note}>
              {item.text}
              <sup>
                <a href={`#src${item.note}`} aria-label={`Source ${item.note}`}>
                  {item.note}
                </a>
              </sup>
            </li>
          ))}
        </ul>
      </section>

      <details id="sources" className={styles.sources} open>
        <summary>Sources and limits</summary>
        <ol>
          <li id="src1">
            <a href="https://wmo.int/site/science-action/weather-forecasts-and-early-warnings">
              WMO
            </a>
            , citing the Global Commission on Adaptation: 24 hours&apos; notice can reduce potential
            damage by 30%. An estimate about damage, not deaths.
          </li>
          <li id="src2">
            <a href="https://www.preventionweb.net/news/un-warns-half-world-not-prepared-disasters">
              UNDRR and WMO
            </a>
            , Global Status of Multi-Hazard Early Warning Systems, October 2022.
          </li>
          <li id="src3">
            <a href="https://www.weather.gov/safety/flood-turn-around-dont-drown">
              US National Weather Service
            </a>
            , Turn Around Don&apos;t Drown.
          </li>
          <li id="src4">
            Nepal figures:{' '}
            <a href="https://rapidmapping.emergency.copernicus.eu/EMSR927">
              Copernicus EMS EMSR927
            </a>
            , <a href="https://www.gdacs.org/">GDACS 1104124</a>,{' '}
            <a href="https://bipadportal.gov.np/">BIPAD Portal</a>. A death toll of more than 1,400
            is a project figure whose official source is still to be confirmed.
          </li>
        </ol>
        <h3 className={styles.h3}>Honest limits</h3>
        <ul>
          {LIMITS.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
        <p className={styles.attr}>
          Data: GEOGloWS ECMWF Streamflow (CC BY 4.0), Open-Meteo.com / Copernicus GloFAS
          (fallback), AWS Terrarium tiles, Nominatim (OpenStreetMap contributors), Copernicus EMS
          EMSR927, GDACS.
        </p>
      </details>

      <p className={styles.back}>
        <Link href="/">Back to home</Link>
      </p>
    </main>
  );
}
