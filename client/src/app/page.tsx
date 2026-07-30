import { redirect } from 'next/navigation';

// Root page redirects to the public chat
export default function Home() {
  redirect('/chat');
}
