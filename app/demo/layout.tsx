import { AppShell } from '@/lib/web/shell';

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <AppShell crumb="Demo · how it works">{children}</AppShell>;
}
