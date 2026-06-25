import { AppShell } from '@/lib/web/shell';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell crumb="Settings">{children}</AppShell>;
}
