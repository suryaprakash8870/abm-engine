import { AppShell } from '@/lib/web/shell';

export default function TodayLayout({ children }: { children: React.ReactNode }) {
  return <AppShell crumb="Today">{children}</AppShell>;
}
