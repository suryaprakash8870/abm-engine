import Link from 'next/link';

export default function IcpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/icp" className="text-lg font-semibold">
            ICP Engine <span className="text-gray-400">/ 01</span>
          </Link>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500">
            workspace: ws_demo
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">{children}</main>
    </div>
  );
}
