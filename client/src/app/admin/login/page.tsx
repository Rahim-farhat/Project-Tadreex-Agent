'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setSession } from '@/lib/api';
import styles from './login.module.css';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || 'Login failed');
      }

      if (data.user?.role !== 'admin') {
        throw new Error('Access denied: Admins only');
      }

      // Cookie gates the admin pages (proxy), localStorage feeds API calls
      setSession(data.token);

      router.replace('/admin');
      router.refresh();
    } catch (err: any) {
      setError(
        err instanceof TypeError
          ? 'Cannot reach the server. Is the API running?'
          : err.message || 'Login failed',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <aside className={styles.showcase} aria-hidden="true">
        <div className={styles.showcaseBrand}>
          <img src="/tadreex.png" alt="" className={styles.logoImg} />
          Tadreex
        </div>
        <div className={styles.showcaseBody}>
          <h2>Scenarios Platform</h2>
          <p>
            Clients describe their VR training with an AI assistant. You review every
            scenario, step by step, in one place.
          </p>
          <ul className={styles.steps}>
            <li><span>1</span>Create a project and share its private link</li>
            <li><span>2</span>The assistant gathers goals, audience and context</li>
            <li><span>3</span>Scenarios are built step by step, ready for production</li>
          </ul>
        </div>
        <div className={styles.showcaseFoot}>scenarios.tadreex.com</div>
      </aside>

      <main className={styles.card}>
        <div className={styles.header}>
          <img src="/tadreex.png" alt="Tadreex" className={styles.mobileLogo} />
          <h1 className={styles.heading}>Sign in</h1>
          <p className={styles.subtitle}>Admin access to Scenarios Platform</p>
        </div>

        <form onSubmit={handleLogin} className={styles.form}>
          {error && <div className={styles.error} role="alert">{error}</div>}
          
          <div className={styles.inputGroup}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              placeholder="you@tadreex.com"
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              placeholder="••••••••"
            />
          </div>

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </main>
    </div>
  );
}
