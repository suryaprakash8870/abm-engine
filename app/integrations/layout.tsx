import { AppShell } from '@/lib/web/shell';

export default function IntegrationsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell crumb="10 · Integrations">{children}</AppShell>;
}
