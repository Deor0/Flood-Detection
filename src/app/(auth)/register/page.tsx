import { ComingSoon } from '@/components/ComingSoon';

export default function Page() {
  return (
    <>
      <ComingSoon title="Register" />
      <p style={{ padding: '0 2rem' }}>
        <a href="/auth/login?screen_hint=signup">Sign up with Auth0</a>
      </p>
    </>
  );
}
