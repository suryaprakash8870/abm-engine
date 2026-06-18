import { AppShell } from '@/lib/web/shell';

export default function AwarenessLayout({ children }: { children: React.ReactNode }) {
  return <AppShell crumb="08 · Awareness">{children}</AppShell>;
}
