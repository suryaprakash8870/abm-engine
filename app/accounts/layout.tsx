import { AppShell } from '@/lib/web/shell';

export default function AccountsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell crumb="Account list">{children}</AppShell>;
}
