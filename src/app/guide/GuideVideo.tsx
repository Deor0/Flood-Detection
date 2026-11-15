'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './guide.module.css';

const VIDEO_ID = 'rV1iqRD9EKY';
const TITLE = 'How to Survive a Flood';

/**
 * Click-to-play preview. Nothing from YouTube loads except the thumbnail until a person presses
 * play, and then the privacy-enhanced (youtube-nocookie) player is used.
 */
export function GuideVideo() {
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (playing) frameRef.current?.focus();
  }, [playing]);

  return (
    <section className={styles.video} aria-labelledby="video-title">
      <h2 id="video-title" className={styles.videoTitle}>
        Watch: {TITLE}
      </h2>
      <div className={styles.videoFrame}>
        {playing ? (
          <iframe
            ref={frameRef}
            className={styles.videoPlayer}
            src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1&rel=0`}
            title={TITLE}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            className={styles.videoPlay}
            onClick={() => setPlaying(true)}
            aria-label={`Play video: ${TITLE}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`}
              alt="Preview of the video How to Survive a Flood"
              loading="lazy"
              className={styles.videoThumb}
            />
            <span className={styles.videoIcon} aria-hidden="true">
              <svg viewBox="0 0 48 48" width="48" height="48">
                <rect width="48" height="48" fill="#2B4FC7" />
                <path d="M19 14 L35 24 L19 34 Z" fill="#ffffff" />
              </svg>
            </span>
          </button>
        )}
      </div>
      <p className={styles.videoMeta}>
        By{' '}
        <a
          href="https://www.youtube.com/@howtosurviveshow"
          target="_blank"
          rel="noopener noreferrer"
        >
          How to Survive Show
        </a>
        . A third-party video about staying safe in a flood. It is not made or checked by this app.
        Follow the steps below and your local authorities.
      </p>
      <a
        className={styles.videoLink}
        href={`https://www.youtube.com/watch?v=${VIDEO_ID}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Watch on YouTube
      </a>
    </section>
  );
}
