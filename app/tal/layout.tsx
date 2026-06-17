import { AppShell } from '@/lib/web/shell';

export default function TalLayout({ children }: { children: React.ReactNode }) {
  return <AppShell crumb="05 · TAL">{children}</AppShell>;
}
