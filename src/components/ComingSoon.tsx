/** Empty placeholder page: just its name, so each route is easy to identify. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <main style={{ padding: '4rem 2rem 2rem' }}>
      <h1>{title}</h1>
    </main>
  );
}
