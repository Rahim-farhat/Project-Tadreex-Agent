import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Conception de scénario',
  description: 'Concevez votre formation VR pas à pas avec l’assistant Tadreex.',
  robots: { index: false, follow: false },
};

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
