import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cipher — Decode Football',
  description: 'Football intelligence that reasons like an elite analyst.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
