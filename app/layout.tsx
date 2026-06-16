import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ABM Engine',
  description: '11 independent engines for Account-Based Marketing.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
