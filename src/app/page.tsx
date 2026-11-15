import Link from 'next/link';
import FeatureMedia, { type ArtSlug } from './home-art/FeatureMedia';
import HeroBackdrop from './home-art/HeroBackdrop';
import styles from './landing.module.css';

export const metadata = {
  title: 'Flood Response: a flood desk and a way to find each other',
  description:
    'Click a river anywhere in the world to see if it is higher than normal, simulate where the water could go, and search a registry of missing people. Educational simulation.',
};

const FEATURES: {
  slug: ArtSlug;
  title: string;
  lines: string[];
  href: string;
  cta: string;
  alt: string;
}[] = [
  {
    slug: 'flood-desk',
    title: 'Flood desk',
    lines: [
      'Click any river on the map and see if it is higher than usual, compared with its own history since 1984.',
      'Then watch where the extra water could spread across real terrain.',
    ],
    href: '/dashboard',
    cta: 'Check a river',
    alt: 'A map with a river and a teal flood zone spreading across low ground beside it',
  },
  {
    slug: 'find-people',
    title: 'Find each other',
    lines: [
      'Search for a name without making an account, or report someone you cannot find.',
      'Children appear as initials, and nothing is ever deleted.',
    ],
    href: '/find',
    cta: 'Find a person',
    alt: 'A search box and a list of people marked missing or found',
  },
  {
    slug: 'sms',
    title: 'SMS simulator',
    lines: [
      'Try searching and reporting as if you were on a basic phone.',
      'It is a practice screen: no real message is ever sent.',
    ],
    href: '/sms-simulator',
    cta: 'Try the simulator',
    alt: 'A basic phone showing a short text conversation',
  },
  {
    slug: 'flood-guide',
    title: 'Flood guide',
    lines: [
      'Short, clear tips for before, during and after a flood.',
      'Every tip names where it comes from.',
    ],
    href: '/guide',
    cta: 'Read the guide',
    alt: 'A checklist for before, during and after a flood',
  },
];

const NEPAL = [
  { value: 'about 7,600', label: 'people in the mapped area' },
  { value: '4,685', label: 'buildings in the mapped area' },
  { value: '26 Aug 2026', label: 'day it happened' },
] as const;

const SHORTCUTS = [
  { href: '/dashboard', title: 'Flood desk', text: 'Is a river high today?' },
  { href: '/find', title: 'Find each other', text: 'Search the registry' },
  { href: '/sms-simulator', title: 'SMS simulator', text: 'Practice on a phone' },
  { href: '/guide', title: 'Flood guide', text: 'What to do, step by step' },
] as const;

const AUDIENCES = [
  {
    title: 'Residents',
    line: 'Check the river near you, then look for family and friends.',
    href: '/dashboard',
    cta: 'Check a river',
  },
  {
    title: 'Relief teams',
    line: 'Log missing people, review reports and run community programs. An account is needed.',
    href: '/missing',
    cta: 'Open the registry',
  },
  {
    title: 'Local authorities',
    line: 'See which rivers are well above normal and rehearse the alert steps. Alerts are simulated: nothing is sent.',
    href: '/dashboard',
    cta: 'See the alert steps',
  },
] as const;

export default function Home() {
  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <HeroBackdrop />
        <div className={styles.heroInner}>
          <h1 id="hero-title" className={styles.heading}>
            <span className={styles.line}>Check your river.</span>
            <span className={styles.line}>Find your people.</span>
            <span className={styles.line}>Know what to do.</span>
          </h1>
          <p className={styles.lede}>
            Welcome. Floods are frightening, so we keep the facts plain and in one place.
          </p>
          <div className={styles.actions}>
            <Link href="/dashboard" className={styles.primary}>
              Check a river
            </Link>
            <Link href="/find" className={styles.secondary}>
              Find a person
            </Link>
            <Link href="/sign-in" className={styles.quiet}>
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <nav className={styles.shortcuts} aria-label="Jump to a tool">
        <ul className={styles.shortcutList}>
          {SHORTCUTS.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={styles.shortcut}>
                <strong>{item.title}</strong>
                <span>{item.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section className={styles.audience} aria-labelledby="audience-title">
        <div className={styles.band}>
          <h2 id="audience-title" className={styles.sectionTitle}>
            Who it helps
          </h2>
          <p className={styles.intro}>
            A 24-hour warning can cut potential flood damage by up to 30% (WMO, an estimate).
          </p>
          <ul className={styles.audienceList}>
            {AUDIENCES.map((who) => (
              <li key={who.title} className={styles.who}>
                <h3 className={styles.whoTitle}>{who.title}</h3>
                <p className={styles.whoLine}>{who.line}</p>
                <Link href={who.href} className={styles.textLink}>
                  {who.cta}
                </Link>
              </li>
            ))}
          </ul>
          <p className={styles.fine}>
            Sign-up uses an email or a US phone number. No real alert or SMS is ever sent.
          </p>
        </div>
      </section>

      <section className={styles.features} aria-labelledby="features-title">
        <div className={styles.band}>
          <h2 id="features-title" className={styles.sectionTitle}>
            What you can do here
          </h2>
          <ul className={styles.rows}>
            {FEATURES.map((feature) => (
              <li key={feature.slug} className={styles.row}>
                <div className={styles.rowMedia}>
                  <FeatureMedia slug={feature.slug} alt={feature.alt} />
                </div>
                <div className={styles.rowText}>
                  <h3 className={styles.rowTitle}>{feature.title}</h3>
                  {feature.lines.map((line) => (
                    <p key={line} className={styles.rowLine}>
                      {line}
                    </p>
                  ))}
                  <Link href={feature.href} className={styles.rowLink}>
                    {feature.cta}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          <p className={styles.extra}>Plus community programs and admin-reviewed records.</p>
        </div>
      </section>

      <section className={styles.nepal} aria-labelledby="nepal-title">
        <div className={styles.nepalInner}>
          <h2 id="nepal-title" className={styles.nepalTitle}>
            Nepal, 26 August 2026
          </h2>
          <ul className={styles.nepalFacts}>
            {NEPAL.map((fact) => (
              <li key={fact.label}>
                <strong>{fact.value}</strong>
                <span>{fact.label}</span>
              </li>
            ))}
          </ul>
          <p className={styles.nepalText}>
            A debris flow struck the Bhote Koshi and Trishuli valleys. Figures are from Copernicus
            EMS EMSR927, as of 5 Oct 2026.
          </p>
          <Link href="/nepal" className={styles.onDark}>
            See what happened and what could have helped
          </Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <p>
          Educational simulation, not an official forecast. No real alert or SMS is ever sent.{' '}
          <Link href="/nepal#sources">Sources and limits</Link>
        </p>
      </footer>
    </main>
  );
}
