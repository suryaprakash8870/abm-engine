import Link from 'next/link';
import { UserMenu } from '@/lib/web/user-menu';

export default function AccountsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/icp" className="text-lg font-semibold">
            ICP Engine <span className="text-gray-400">/ Account list</span>
          </Link>
          <UserMenu />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">{children}</main>
    </div>
  );
}
