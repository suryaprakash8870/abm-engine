import { AppShell } from '@/lib/web/shell';

export default function TamLayout({ children }: { children: React.ReactNode }) {
  return <AppShell crumb="Upload companies">{children}</AppShell>;
}
