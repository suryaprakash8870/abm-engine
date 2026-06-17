'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { me, logout } from './auth-api';

/** Header widget: shows the logged-in email + a logout button. */
export function UserMenu() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    void me().then((r) => {
      if (r.ok && r.data) setEmail(r.data.email);
    });
  }, []);

  return (
    <div className="flex items-center gap-3 text-xs text-gray-500">
      {email && <span>{email}</span>}
      <button
        onClick={async () => {
          await logout();
          router.push('/login');
          router.refresh();
        }}
        className="underline hover:text-gray-700"
      >
        Log out
      </button>
    </div>
  );
}
