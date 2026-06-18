import { AppShell } from '@/lib/web/shell';

export default function SignalsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell crumb="07 · Signals">{children}</AppShell>;
}
