import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Duck Draw — A little luck. A perfect shot.', description: 'An 8-bit lucky draw experience.' };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
