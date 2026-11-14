import { ClerkProvider, Show } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminNavGate } from '@/components/AdminNavGate';
import { Nav } from '@/components/Nav';
import './globals.css';

export const metadata: Metadata = { title: 'Flood Response' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider>
          <Suspense>
            <Show when="signed-in">
              <Suspense fallback={<Nav />}>
                <AdminNavGate />
              </Suspense>
            </Show>
          </Suspense>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
