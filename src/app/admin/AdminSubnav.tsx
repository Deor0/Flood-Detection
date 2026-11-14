'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './admin.module.css';

const LINKS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/programs', label: 'Programs' },
  { href: '/admin/missing', label: 'Missing people' },
  { href: '/admin/users', label: 'Users' },
] as const;

export function AdminSubnav() {
  const pathname = usePathname() ?? '';
  return (
    <nav aria-label="Admin" className={styles.subnav}>
      {LINKS.map((l) => {
        const active = l.href === '/admin' ? pathname === '/admin' : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`${styles.subtab} ${active ? styles.subactive : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
