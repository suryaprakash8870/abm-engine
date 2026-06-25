import { AppShell } from '@/lib/web/shell';

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return <AppShell crumb="Guide · how to use every engine">{children}</AppShell>;
}
