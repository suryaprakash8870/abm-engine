import { GlowBackground } from '@/lib/web/shell';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center p-6 text-white">
      <GlowBackground />
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
