import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'scaena — scenic backdrops for the modern web',
  description:
    'Drop-in scenic, animated backdrops for your hero sections. One line, beautiful out of the box.',
  applicationName: 'scaena',
  authors: [{ name: 'scaena' }],
  keywords: [
    'react',
    'background',
    'backdrop',
    'canvas',
    'animation',
    'hero',
    'scaena',
  ],
  openGraph: {
    title: 'scaena — scenic backdrops for the modern web',
    description:
      'Drop-in scenic, animated backdrops for your hero sections. One line, beautiful out of the box.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#05060d',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#05060d] text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
