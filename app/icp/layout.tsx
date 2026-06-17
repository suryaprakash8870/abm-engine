import { AppShell } from '@/lib/web/shell';

export default function IcpLayout({ children }: { children: React.ReactNode }) {
  return <AppShell crumb="01">{children}</AppShell>;
}
