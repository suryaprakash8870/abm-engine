/**
 * Auth layout — pass-through wrapper. Login and signup each own their own
 * full-viewport split layout (marketing on the left, form on the right).
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen text-white">{children}</div>;
}
