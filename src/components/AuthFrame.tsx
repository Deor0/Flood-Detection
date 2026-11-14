import type { ReactNode } from 'react';

/** Centered lavender page around the sign-in / sign-up cards. */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="auth-frame">
      <p className="auth-wordmark">FLOOD RESPONSE</p>
      {children}
    </main>
  );
}
