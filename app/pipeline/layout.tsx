import { AppShell } from '@/lib/web/shell';

export default function PipelineLayout({ children }: { children: React.ReactNode }) {
  return <AppShell crumb="Pipeline">{children}</AppShell>;
}
