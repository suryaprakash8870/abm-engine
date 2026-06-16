export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-10">
      <h1 className="text-2xl font-semibold">ABM Engine</h1>
      <p className="mt-2 text-gray-600">
        11 independent engines connected by an event bus. See{' '}
        <code>docs/project/architecture.md</code> and <code>docs/project/ownership.md</code>.
      </p>
    </main>
  );
}
