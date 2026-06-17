import type { Metadata } from 'next';
import { Sora } from 'next/font/google';
import './globals.css';

const display = Sora({ subsets: ['latin'], variable: '--font-display', display: 'swap' });

export const metadata: Metadata = {
  title: 'ABM Engine',
  description: '11 independent engines for Account-Based Marketing.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={display.variable}>
      <body>{children}</body>
    </html>
  );
}
