import { AppShell } from '@/lib/web/shell';

export default function PlaysLayout({ children }: { children: React.ReactNode }) {
  return <AppShell crumb="09 · Plays">{children}</AppShell>;
}
