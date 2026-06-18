import { AppShell } from '@/lib/web/shell';

export default function InsightsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell crumb="11 · Insights">{children}</AppShell>;
}
