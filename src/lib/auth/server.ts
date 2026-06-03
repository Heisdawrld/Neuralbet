import { auth as clerkAuth, currentUser as clerkCurrentUser } from '@clerk/nextjs/server';

export async function getAuth() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
    return { userId: 'dev-user' };
  }
  return clerkAuth();
}

export async function getCurrentUser() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
    return { firstName: 'David' };
  }
  return clerkCurrentUser();
}
