import { AppShell } from '@/lib/web/shell';

export default function ContactsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell crumb="06 · Contacts">{children}</AppShell>;
}
