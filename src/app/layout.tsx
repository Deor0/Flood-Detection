import { ClerkProvider, Show, UserButton } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';

export const metadata: Metadata = { title: 'Flood Response' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider>
          <div className="app-user">
            <Suspense>
              <Show when="signed-in">
                <UserButton />
              </Show>
            </Suspense>
          </div>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
