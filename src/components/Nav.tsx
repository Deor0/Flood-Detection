'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { signInHref } from './SignInLink';
import styles from './Nav.module.css';

const TABS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/missing', label: 'Missing People' },
  { href: '/communities', label: 'Communities' },
  { href: '/guide', label: 'Flood Guide' },
  { href: '/sms-simulator', label: 'SMS Simulator' },
] as const;

/**
 * Top bar. Signed in: the profile menu (UserButton) includes sign out. Signed out: the public tabs
 * and a "Sign in" link that returns here afterwards (hidden on Clerk's own sign-in/up pages).
 */
export function Nav({
  isAdmin = false,
  signedIn = true,
}: {
  isAdmin?: boolean;
  signedIn?: boolean;
}) {
  const pathname = usePathname() ?? '';
  if (!signedIn && (pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up'))) {
    return null;
  }
  const visible = signedIn ? TABS : TABS.filter((tab) => tab.href !== '/sms-simulator');
  const tabs = isAdmin ? [...visible, { href: '/admin', label: 'Admin' }] : visible;
  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          <img src="/home/logo.png" alt="Poseidon Surge" className={styles.logo} />
        </Link>
        <nav aria-label="Main" className={styles.tabs}>
          {tabs.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`${styles.tab} ${active ? styles.active : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <div className={styles.profile}>
          {signedIn ? (
            <UserButton />
          ) : (
            <Link href={signInHref(pathname)} className={styles.tab}>
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
