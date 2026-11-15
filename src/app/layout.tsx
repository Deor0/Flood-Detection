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

// Clerk's profile menu follows the same ocean, royal and cyan palette as the rest of the app.
const clerkAppearance = {
  elements: {
    avatarBox: { borderRadius: 0 },
    userButtonAvatarBox: { borderRadius: 0 },
    userButtonTrigger: { borderRadius: 0 },
  },
  variables: {
    colorPrimary: '#2B4FC7',
    colorBackground: '#ffffff',
    colorInputBackground: '#DFEAF6',
    colorText: '#0B1F3A',
    colorTextSecondary: '#3A4F6B',
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
            <Show when="signed-in" fallback={<Nav signedIn={false} />}>
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
