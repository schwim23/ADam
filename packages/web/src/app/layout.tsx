import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ADam — Agentic Ad Operations',
  description: 'Open-source AI advertising agent built on AdCP',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
