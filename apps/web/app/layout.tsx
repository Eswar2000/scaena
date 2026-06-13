import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'scaena — scenic backdrops for the modern web',
  description:
    'Drop-in scenic, animated backdrops for your hero sections. One line, beautiful out of the box.',
};

export const viewport: Viewport = {
  themeColor: '#05060d',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
