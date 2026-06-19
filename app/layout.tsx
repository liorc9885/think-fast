import type { ReactNode } from 'react';

export const metadata = {
  title: 'Think-Fast',
  description: 'Think-Fast — API + dashboard host for the המבורגר נופל game.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
