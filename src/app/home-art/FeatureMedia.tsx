import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { FindArt, FloodDeskArt, GuideArt, HeroArt, SmsArt } from './art';
import styles from './home-art.module.css';

export const ART_SLUGS = ['flood-desk', 'find-people', 'sms', 'flood-guide', 'hero'] as const;
export type ArtSlug = (typeof ART_SLUGS)[number];

const IMAGE_EXTS = ['webp', 'jpg', 'jpeg', 'png'] as const;
const VIDEO_EXTS = ['mp4', 'webm'] as const;

const ART: Record<ArtSlug, (props: { className?: string }) => React.JSX.Element> = {
  'flood-desk': FloodDeskArt,
  'find-people': FindArt,
  sms: SmsArt,
  'flood-guide': GuideArt,
  hero: HeroArt,
};

export function findFile(slug: ArtSlug, exts: readonly string[]): string | null {
  for (const ext of exts) {
    const name = `${slug}.${ext}`;
    if (existsSync(path.join(process.cwd(), 'public', 'home', name))) return `/home/${name}`;
  }
  return null;
}

export type Credit = { photographer: string; photoUrl: string };

/** Reads public/home/credits.json; a missing or malformed file, or entry, means no credit. */
export function readCredit(slug: ArtSlug): Credit | null {
  try {
    const raw = readFileSync(path.join(process.cwd(), 'public', 'home', 'credits.json'), 'utf8');
    const entry = (JSON.parse(raw) as Record<string, unknown> | null)?.[slug] as
      { photographer?: unknown; photoUrl?: unknown } | undefined;
    if (!entry || typeof entry.photographer !== 'string' || typeof entry.photoUrl !== 'string') {
      return null;
    }
    const photographer = entry.photographer.trim();
    // Only http(s) links: never render a javascript: or data: URL from a data file.
    if (!photographer || !/^https?:\/\//i.test(entry.photoUrl)) return null;
    return { photographer, photoUrl: entry.photoUrl };
  } catch {
    return null;
  }
}

/**
 * A picture for a home-page feature. If you drop `<slug>.webp|jpg|jpeg|png` or `<slug>.mp4|webm`
 * into `public/home/` it shows that file (video wins over image); otherwise the built-in SVG
 * illustration. The box keeps one aspect ratio (4:3, hero 16:10) so the layout never jumps.
 */
export default function FeatureMedia({ slug, alt }: { slug: ArtSlug; alt: string }) {
  const boxClass = `${styles.box} ${slug === 'hero' ? styles.hero : styles.card}`;
  const video = findFile(slug, VIDEO_EXTS);
  const image = video ? null : findFile(slug, IMAGE_EXTS);
  const Art = ART[slug];
  const credit = image ? readCredit(slug) : null;

  return (
    <div className={boxClass}>
      {video ? (
        <video
          className={styles.fill}
          src={video}
          muted
          loop
          playsInline
          controls
          preload="metadata"
          aria-label={alt}
        />
      ) : image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.fill}
          src={image}
          alt={alt}
          loading={slug === 'hero' ? 'eager' : 'lazy'}
        />
      ) : (
        <Art className={styles.fill} />
      )}
      {credit && (
        <p className={styles.credit}>
          Photo:{' '}
          <a href={credit.photoUrl} target="_blank" rel="noopener noreferrer">
            {credit.photographer} / Unsplash
          </a>
        </p>
      )}
    </div>
  );
}
