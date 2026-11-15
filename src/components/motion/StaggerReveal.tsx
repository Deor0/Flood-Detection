'use client';

import { useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import styles from './stagger-reveal.module.css';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const DURATION = 0.6;
const STAGGER = 0.08;
const START = 'top 85%';

/**
 * Staggered cascade. Every `[data-reveal-group]` inside plays its `[data-reveal]` items one after
 * another, in DOM order: the first group on load, the rest when they scroll into view.
 *
 * The server HTML carries the `pending` class, which hides the items before the first paint so
 * nothing flashes. A CSS failsafe shows them after a few seconds if this script never runs, and
 * reduced-motion users are never hidden at all. Only opacity and transform change, so hidden items
 * stay focusable; focusing one scrolls it into view, which plays its group.
 */
export function StaggerReveal({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  // Decided once, on the very first run. React may run this effect again (Strict Mode in dev,
  // Fast Refresh), and by then the items are visible because the previous run was reverted.
  const failsafeFired = useRef<boolean | null>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;

      if (failsafeFired.current === null) {
        // Slow load: the CSS failsafe already showed the items before this script arrived.
        const first = el.querySelector<HTMLElement>('[data-reveal]');
        failsafeFired.current =
          el.classList.contains(styles.pending) &&
          !!first &&
          getComputedStyle(first).opacity !== '0';
      }
      const keepVisibleOnScreen = failsafeFired.current;

      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const groups = gsap.utils.toArray<HTMLElement>('[data-reveal-group]', el);
        const fold = window.innerHeight * 0.85;
        let queued = 0; // groups already on screen at load wait their turn after the one above

        groups.forEach((group, index) => {
          const items = gsap.utils.toArray<HTMLElement>('[data-reveal]', group);
          if (items.length === 0) return;
          const rect = group.getBoundingClientRect();
          // Already scrolled past (a reload or back navigation mid-page): just show it.
          if (rect.bottom <= 0) return;
          const length = DURATION + STAGGER * (items.length - 1);
          const onScreen = index === 0 || rect.top < fold;
          // Already shown by the failsafe and in view: hiding it again would blink. Groups further
          // down are off screen, so they can still play when scrolled to.
          if (onScreen && keepVisibleOnScreen) return;
          const delay = onScreen ? queued : 0;
          if (onScreen) queued += length * 0.6;

          gsap.fromTo(
            items,
            { opacity: 0, y: 24 },
            {
              opacity: 1,
              y: 0,
              duration: DURATION,
              stagger: STAGGER,
              ease: 'power2.out',
              delay,
              clearProps: 'opacity,transform',
              scrollTrigger: index === 0 ? undefined : { trigger: group, start: START, once: true },
            },
          );
        });
      });

      // Start states are set (fromTo renders them at once), so the CSS hiding can go.
      el.classList.remove(styles.pending);
    },
    { scope: root },
  );

  return (
    <div ref={root} className={`${styles.root} ${styles.pending}`}>
      <noscript
        dangerouslySetInnerHTML={{
          __html: '<style>[data-reveal]{opacity:1!important;animation:none!important}</style>',
        }}
      />
      {children}
    </div>
  );
}
