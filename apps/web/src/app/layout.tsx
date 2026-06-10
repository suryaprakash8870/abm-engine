import type { Metadata } from 'next';
import { ReactQueryProvider } from './providers';
import { TopNav } from '@/components/nav';
import './globals.css';

export const metadata: Metadata = {
  title: 'ABM Engine',
  description: 'CRM-agnostic ABM intelligence layer.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <ReactQueryProvider>
          <TopNav />
          <div className="pt-2">{children}</div>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
