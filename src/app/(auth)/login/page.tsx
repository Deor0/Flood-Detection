import { ComingSoon } from '@/components/ComingSoon';

export default function Page() {
  return (
    <>
      <ComingSoon title="Login" />
      <p style={{ padding: '0 2rem' }}>
        <a href="/auth/login">Log in with Auth0</a>
      </p>
    </>
  );
}
