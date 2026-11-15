import type { ReactNode } from 'react';

/** Centered page with the Poseidon Surge wordmark around the sign-in / sign-up cards. */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="auth-frame">
      <p className="auth-wordmark">POSEIDON SURGE</p>
      {children}
    </main>
  );
}
