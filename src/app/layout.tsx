import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BluePanel',
  description: 'BluePanel deployment control center'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-on-surface font-sans antialiased">{children}</body>
    </html>
  );
}
