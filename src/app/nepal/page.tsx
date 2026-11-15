import Link from 'next/link';
import NepalImpact from '../NepalImpact';
import styles from './nepal.module.css';

export const metadata = {
  title: 'Nepal, 26 August 2026 (The Telling) | Flood Response',
  description:
    'A sourced look at the Rasuwa flash flood of 26 August 2026, reportedly triggered by a glacial lake outburst: what happened, what a warning could have changed, and the limits of river models.',
};

const EMSR = 'https://rapidmapping.emergency.copernicus.eu/EMSR927';
const CHARTER = 'https://disasterscharter.org/activations/flood-in-nepal-activation-1052-';
const GDACS = 'https://www.gdacs.org/report.aspx?eventtype=FL&eventid=1104124';

const FACTS = [
  {
    value: '26 Aug 2026',
    label: 'flash flood struck Rasuwa (reportedly a glacial lake outburst flood)',
    source: 'Copernicus EMS EMSR927',
  },
  {
    value: 'about 7,600',
    label: 'people affected in the mapped areas (estimate)',
    source: 'Copernicus EMS EMSR927',
  },
  {
    value: '4,685',
    label: 'buildings affected in the mapped areas (estimate)',
    source: 'Copernicus EMS EMSR927',
  },
  {
    value: '1,580 ha',
    label: 'maximum mapped flood extent, across 6 mapped areas',
    source: 'Copernicus EMS EMSR927',
  },
] as const;

/** Only dates confirmed in the cited records. */
const TIMELINE = [
  {
    when: '26 Aug, about 9:15 local time',
    text: 'A sudden surge of water enters the Bhote Koshi from the Tibet (China) side and hits Timure and Rasuwagadhi, then moves down towards Syapru Besi and the Trishuli.',
    source: 'International Charter, activation 1052',
    href: CHARTER,
  },
  {
    when: '26 Aug, 09:53 UTC',
    text: 'Copernicus EMS rapid mapping is activated (EMSR927). The International Charter is activated the same day.',
    source: 'Copernicus EMS EMSR927; International Charter',
    href: EMSR,
  },
  {
    when: '27 Aug',
    text: 'First post-event satellite images (WorldView-3) of Syapru Besi and Timure are acquired for damage mapping.',
    source: 'Copernicus EMS EMSR927',
    href: EMSR,
  },
  {
    when: '26 Aug to 1 Sep',
    text: 'GDACS keeps a red flood alert for Nepal.',
    source: 'GDACS 1104124',
    href: GDACS,
  },
  {
    when: '14 Sep',
    text: 'The Copernicus EMS situational report for EMSR927 is last updated.',
    source: 'Copernicus EMS EMSR927 report',
    href: 'https://storymaps.arcgis.com/stories/f76baefadfa74d6d9a18265875f48870',
  },
] as const;

const WHY = [
  { text: 'Up to 30% less potential damage with 24 hours of warning (an estimate).', note: 1 },
  { text: '8 times higher disaster mortality where early-warning coverage is limited.', note: 2 },
] as const;

const LIMITS = [
  'Educational simulation, not an official forecast or warning.',
  'Severity compares simulated river flow (GEOGloWS, or Copernicus GloFAS as a fallback) with its own 1984-present history.',
  'Depth uses an assumed bankfull depth, which you can adjust.',
  'Elevation is about 30 m resolution with errors of several metres.',
  'Glacial lake outburst floods (GLOFs), landslides and debris flows are not modelled. The app cannot forecast a sudden surge like this one; it can only relay a warning once someone raises it.',
  'Building and population counts are satellite-based estimates.',
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
        <p className={styles.kicker}>The Telling</p>
        <h1 className={styles.title}>Nepal, 26 August 2026</h1>
        <p className={styles.intro}>
          A flash flood surged down the Bhote Koshi into Rasuwa and on down the Trishuli. Copernicus
          EMS records it as reportedly triggered by a glacial lake outburst flood (GLOF). The
          International Charter notes that the exact cause is still under investigation, with a
          landslide or rockslide on the Tibetan side among the mechanisms considered. We remember
          the people who died. This page is a sourced record, not a game.
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

      <section className={styles.block} aria-labelledby="timeline-title">
        <h2 id="timeline-title" className={styles.h2}>
          Timeline
        </h2>
        <ol className={styles.timeline}>
          {TIMELINE.map((step) => (
            <li key={step.when} className={styles.step}>
              <span className={styles.when}>{step.when}</span>
              <span>
                {step.text} <a href={step.href}>{step.source}</a>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.block} aria-labelledby="whatif-title">
        <h2 id="whatif-title" className={styles.h2}>
          What a warning could change
        </h2>
        <NepalImpact />
        <details className={styles.honest} open>
          <summary>What this app would not have caught</summary>
          <p>
            Our river model could <strong>not</strong> have forecast this surge: a glacial lake
            outburst or a landslide upstream is not in the rain and river-flow models it reads. The
            app would have helped with a warning relay (admin-verified alerts, an SMS command
            simulator), finding people faster (the registry and public search) and coordination
            (community programs).
          </p>
          <p>
            Living in a steep valley? Read{' '}
            <Link href="/guide#mountain">Mountain floods: GLOF and debris flows</Link> in the Flood
            Guide.
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
            <a href="https://wmo.int/news/media-centre/un-warns-half-world-not-prepared-disasters">
              UNDRR and WMO
            </a>
            , Global Status of Multi-Hazard Early Warning Systems, October 2022.
          </li>
          <li id="src3">
            Nepal figures and dates: <a href={EMSR}>Copernicus EMS EMSR927</a> (affected people and
            buildings are the sum of the latest map of each area),{' '}
            <a href={CHARTER}>International Charter activation 1052</a>,{' '}
            <a href={GDACS}>GDACS 1104124</a>. Checked 15 November 2026. We do not give a death
            toll: we have not found a confirmed official figure.
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
