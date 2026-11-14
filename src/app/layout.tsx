import { ClerkProvider, Show } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { Suspense } from 'react';
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
              <Nav />
            </Show>
          </Suspense>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
