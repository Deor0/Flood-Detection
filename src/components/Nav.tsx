'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import styles from './Nav.module.css';

const TABS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/missing', label: 'Missing People' },
  { href: '/communities', label: 'Communities' },
  { href: '/guide', label: 'Flood Guide' },
  { href: '/sms-simulator', label: 'SMS Simulator' },
] as const;

/** Top bar for signed-in pages. The profile menu (UserButton) includes sign out. */
export function Nav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname() ?? '';
  const tabs = isAdmin ? [...TABS, { href: '/admin', label: 'Admin' }] : TABS;
  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label="Flood Response, home">
          <span className={styles.mark} aria-hidden="true" />
          FLOOD RESPONSE
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
          <UserButton />
        </div>
      </div>
    </header>
  );
}
