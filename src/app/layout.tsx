import { ClerkProvider, Show } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminNavGate } from '@/components/AdminNavGate';
import { Nav } from '@/components/Nav';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import './globals.css';

export const metadata: Metadata = { title: 'Flood Response' };

// Clerk's profile menu follows the same Fog + teal palette as the rest of the app.
const clerkAppearance = {
  elements: {
    avatarBox: { borderRadius: 0 },
    userButtonAvatarBox: { borderRadius: 0 },
    userButtonTrigger: { borderRadius: 0 },
  },
  variables: {
    colorPrimary: '#0e6f7e',
    colorBackground: '#ffffff',
    colorInputBackground: '#e2eaec',
    colorText: '#0d2b38',
    colorTextSecondary: '#3b5662',
    borderRadius: '0',
    fontFamily: "Roboto, system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider appearance={clerkAppearance}>
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
