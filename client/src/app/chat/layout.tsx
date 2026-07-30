import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Chat | Tadreex Agent',
  description: 'Chat with your AI tutor — ask questions, get explanations, and learn faster.',
};

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
