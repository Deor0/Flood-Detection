import type { ReactNode } from 'react';
import { adminPageGuard } from '@/lib/roles';
import { AdminSubnav } from './AdminSubnav';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await adminPageGuard();
  return (
    <>
      <AdminSubnav />
      {children}
    </>
  );
}
