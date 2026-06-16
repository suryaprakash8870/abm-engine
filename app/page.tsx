import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-10">
      <h1 className="text-2xl font-semibold">ABM Engine</h1>
      <p className="mt-2 text-gray-600">
        11 independent engines connected by an event bus. See{' '}
        <code>docs/project/architecture.md</code> and <code>docs/project/ownership.md</code>.
      </p>
      <Link
        href="/icp"
        className="mt-6 inline-block rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
      >
        Open ICP Engine →
      </Link>
    </main>
  );
}
