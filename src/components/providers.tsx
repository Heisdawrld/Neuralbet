'use client';

import { ClerkProvider } from '@clerk/nextjs';
import { QueryProvider } from './query-provider';

export function Providers({ children }: { children: React.ReactNode }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const content = <QueryProvider>{children}</QueryProvider>;
  if (!publishableKey) return content;
  return <ClerkProvider publishableKey={publishableKey}>{content}</ClerkProvider>;
}
