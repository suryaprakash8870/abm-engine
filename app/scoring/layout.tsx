import { AppShell } from '@/lib/web/shell';

export default function ScoringLayout({ children }: { children: React.ReactNode }) {
  return <AppShell crumb="04 · Scoring">{children}</AppShell>;
}
