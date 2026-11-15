'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from '@/components/page-ui.module.css';

/** `/sign-in?redirect_url=<path>`: Clerk sends the visitor back to `path` after signing in. */
export function signInHref(path: string): string {
  return `/sign-in?redirect_url=${encodeURIComponent(path || '/')}`;
}

/**
 * Shown to signed-out visitors in place of a control that changes data. It is only a hint: every
 * server action checks the viewer itself.
 */
export function SignInLink({ to, small = false }: { to: string; small?: boolean }) {
  const pathname = usePathname() ?? '/';
  return (
    <Link
      href={signInHref(pathname)}
      className={`${styles.button} ${styles.buttonLight} ${small ? styles.smallButton : ''}`}
    >
      Sign in to {to}
    </Link>
  );
}
