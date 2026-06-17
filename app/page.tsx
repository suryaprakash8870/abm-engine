import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-10">
      <h1 className="text-2xl font-semibold">ABM Engine</h1>
      <p className="mt-2 text-gray-600">
        11 independent engines connected by an event bus. See{' '}
        <code>docs/project/architecture.md</code> and <code>docs/project/ownership.md</code>.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Link href="/signup" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">
          Get started →
        </Link>
        <Link href="/login" className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Log in
        </Link>
      </div>
    </main>
  );
}
