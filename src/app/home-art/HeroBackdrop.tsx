import { findFile, readCredit } from './FeatureMedia';
import { HeroArt } from './art';
import styles from './hero-backdrop.module.css';

/**
 * The full-bleed picture behind the home hero. Uses `public/home/hero.webp|jpg|jpeg|png` (or a
 * muted looping `hero.mp4|webm`) when present; otherwise draws the river-valley illustration on
 * the right of a deep-teal field, so there is never a broken image. Purely decorative: the text
 * over it carries the meaning, so the picture is hidden from screen readers.
 */
export default function HeroBackdrop() {
  const video = findFile('hero', ['mp4', 'webm']);
  const image = video ? null : findFile('hero', ['webp', 'jpg', 'jpeg', 'png']);
  const credit = image ? readCredit('hero') : null;

  return (
    <div className={styles.backdrop} aria-hidden={credit ? undefined : true}>
      <div className={styles.picture} aria-hidden="true">
        {video ? (
          <video
            className={styles.fill}
            src={video}
            muted
            loop
            playsInline
            autoPlay
            tabIndex={-1}
          />
        ) : image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.fill} src={image} alt="" />
        ) : (
          <div className={styles.art}>
            <HeroArt className={styles.artSvg} />
          </div>
        )}
      </div>
      <div className={styles.wash} aria-hidden="true" />
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
