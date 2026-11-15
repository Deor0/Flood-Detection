import Link from 'next/link';
import styles from './landing.module.css';

export const metadata = {
  title: 'Flood Response: a flood desk and a way to find each other',
  description:
    'Click a river anywhere in the world to see how unusual its flow is today, simulate where the water could go, and search a registry of missing people. Educational simulation.',
};

const LADDER = [
  { level: 'Normal', rule: 'Under a 2-year flow', tone: 'normal' },
  { level: 'Watch', rule: '2 to 5 years', tone: 'watch' },
  { level: 'Warning', rule: '5 to 20 years', tone: 'warning' },
  { level: 'Severe', rule: '20 years or more', tone: 'severe' },
] as const;

const FACTS = [
  { value: '1984', label: 'river history each flow is compared with' },
  { value: '16 days', label: 'of forecast discharge on every click' },
  { value: '~30 m', label: 'terrain resolution, errors of several metres' },
  { value: '0', label: 'real alerts, SMS or calls ever sent' },
] as const;

/** A river valley cut in two: the same valley at a normal level and at a 20-year flood. */
function ValleyDiagram() {
  return (
    <svg
      viewBox="0 0 480 260"
      role="img"
      aria-labelledby="valley-title valley-desc"
      className={styles.diagram}
    >
      <title id="valley-title">A river valley with three water levels</title>
      <desc id="valley-desc">
        The same valley cross-section. Water inside the channel is normal. A larger flow spreads
        onto the low ground beside the river. A hollow behind a ridge stays dry until the water is
        high enough to clear the ridge.
      </desc>
      <rect width="480" height="260" fill="#0a3a47" />
      {/* 20-year level */}
      <path d="M0 130 H480 V260 H0Z" fill="#8fd0d8" opacity="0.32" />
      {/* 5-year level */}
      <path d="M0 160 H480 V260 H0Z" fill="#3fa5b3" opacity="0.5" />
      {/* channel level */}
      <path d="M0 190 H480 V260 H0Z" fill="#0e6f7e" opacity="0.85" />
      {/* terrain: valley with a ridge and a hollow on the right */}
      <path
        d="M0 70 L60 84 L120 118 L170 176 L205 214 L240 232 L275 214 L310 176 L350 138 L385 92 L405 80 L425 112 L450 126 L480 120 V260 H0Z"
        fill="#e2eaec"
        opacity="0.96"
      />
      <path
        d="M0 70 L60 84 L120 118 L170 176 L205 214 L240 232 L275 214 L310 176 L350 138 L385 92 L405 80 L425 112 L450 126 L480 120"
        fill="none"
        stroke="#0d2b38"
        strokeWidth="2"
      />
      <g fontFamily="Roboto, sans-serif" fontSize="12" fontWeight="700" fill="#0d2b38">
        <text x="14" y="124">
          20-YEAR FLOW
        </text>
        <text x="14" y="155">
          5-YEAR FLOW
        </text>
        <text x="14" y="186">
          NORMAL
        </text>
      </g>
      <g fontFamily="Roboto, sans-serif" fontSize="11" fill="#e2eaec">
        <text x="352" y="62">
          ridge
        </text>
        <text x="408" y="104" fontSize="10" fill="#0d2b38">
          dry hollow
        </text>
      </g>
    </svg>
  );
}

export default function Home() {
  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroInner}>
          <div className={styles.heroText}>
            <p className={styles.eyebrow}>Flood Response · educational simulation</p>
            <h1 id="hero-title" className={styles.heading}>
              Is this river normal today?
              <span className={styles.headingSecond}> And where is everyone?</span>
            </h1>
            <p className={styles.lede}>
              Raw river data never says whether a flow is ordinary or dangerous, and after a
              disaster families have nowhere single to look for each other. Click any river on Earth
              for a plain-language rating and a simulation of where the water could go, then search
              a registry of missing people.
            </p>
            <div className={styles.actions}>
              <Link href="/dashboard" className={styles.primary}>
                Open the flood desk
              </Link>
              <Link href="/find" className={styles.secondary}>
                Find a person
              </Link>
              <Link href="/sign-in" className={styles.ghost}>
                Sign in
              </Link>
            </div>
          </div>
          <figure className={styles.figure}>
            <ValleyDiagram />
            <figcaption>
              The same valley at three flows. Low ground beside the channel floods first; a hollow
              behind a ridge stays dry until the water clears it.
            </figcaption>
          </figure>
        </div>
      </section>

      <section className={styles.facts} aria-label="At a glance">
        {FACTS.map((fact) => (
          <div key={fact.label} className={styles.fact}>
            <span className={styles.factValue}>{fact.value}</span>
            <span className={styles.factLabel}>{fact.label}</span>
          </div>
        ))}
      </section>

      <section className={styles.section} aria-labelledby="how-title">
        <h2 id="how-title" className={styles.sectionTitle}>
          From a click to a rating in three steps
        </h2>
        <ol className={styles.steps}>
          <li className={styles.card}>
            <span className={styles.step}>1 · CLICK</span>
            <h3>Pick a river</h3>
            <p>
              Click anywhere on the map. We check the nearby river cells and use the one carrying
              the most water, because a click rarely lands exactly on the channel.
            </p>
          </li>
          <li className={styles.card}>
            <span className={styles.step}>2 · COMPARE</span>
            <h3>How unusual is the flow?</h3>
            <p>
              Today&apos;s modelled discharge and the 16-day forecast are compared with the same
              river&apos;s own history. We rate how often a flow that big comes back.
            </p>
          </li>
          <li className={styles.card}>
            <span className={styles.step}>3 · SIMULATE</span>
            <h3>Where could the water go?</h3>
            <p>
              The water above the bank is spread over real terrain by height above the nearest
              river, so a pit behind a ridge is not flooded just because it is low.
            </p>
          </li>
        </ol>

        <div className={styles.ladder} role="list" aria-label="Severity scale">
          {LADDER.map((step) => (
            <div key={step.level} role="listitem" className={`${styles.rung} ${styles[step.tone]}`}>
              <strong>{step.level}</strong>
              <span>{step.rule}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="people-title">
        <div className={styles.split}>
          <div>
            <h2 id="people-title" className={styles.sectionTitle}>
              Then find each other
            </h2>
            <p className={styles.text}>
              A shared registry where anyone can report a missing person and anyone can mark them
              found. Search by name without an account: you see only whether a person is missing or
              found and a coarse area, and children appear as initials. Full details need sign-in.
            </p>
            <Link href="/find" className={styles.secondary}>
              Search the registry
            </Link>
          </div>
          <div>
            <h3 className={styles.subTitle}>Built for the weeks after</h3>
            <ul className={styles.list}>
              <li>Community programs for shelter, supplies and recovery, approved by an admin.</li>
              <li>
                Every change is logged. Nothing is ever deleted; people move missing to found.
              </li>
              <li>An SMS command simulator shows how a plain phone could search and report.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.case} aria-labelledby="case-title">
        <div className={styles.caseInner}>
          <p className={styles.caseEyebrow}>Case study</p>
          <h2 id="case-title" className={styles.caseTitle}>
            Nepal, 26 August 2026
          </h2>
          <p className={styles.caseText}>
            A rock-and-ice slope failure above the Bhote Koshi and Trishuli rivers in Rasuwa sent a
            debris flow down the valley. More than 1,400 people died. We remember them, and we treat
            the replay with care: it is a sourced timeline with dates and figures, not a game.
          </p>
          <p className={styles.caseText}>
            The replay is <strong>not an animated river rise</strong>. River models and rain data
            show no spike for this event, because debris flows and landslide-dam or glacial-lake
            floods are something a river-flow model cannot see. That blind spot is the point.
          </p>
          <Link href="/dashboard" className={styles.onDark}>
            Open the replay
          </Link>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="limits-title">
        <h2 id="limits-title" className={styles.sectionTitle}>
          Honest limits
        </h2>
        <ul className={styles.limits}>
          <li>This is an educational simulation, not an official forecast or warning.</li>
          <li>No real alert, SMS or phone call is ever sent. Alert text is labelled SIMULATION.</li>
          <li>Severity compares GloFAS modelled discharge with its own 1984-present history.</li>
          <li>Elevation is about 30 m resolution with errors of several metres.</li>
          <li>Depth uses an assumed bankfull depth, which you can adjust.</li>
          <li>Building and population counts are estimates.</li>
        </ul>
        <p className={styles.footer}>
          Flood data: Open-Meteo.com / Copernicus GloFAS. Elevation: AWS Terrarium tiles. Nepal
          figures: Copernicus EMS EMSR927 and GDACS.
        </p>
      </section>
    </main>
  );
}
