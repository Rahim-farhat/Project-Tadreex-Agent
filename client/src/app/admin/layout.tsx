'use client';

import { useEffect, useState } from 'react';
import styles from './admin.module.css';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const saved = localStorage.getItem('tadreex-theme') as 'dark' | 'light' | null;
    if (saved) setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('tadreex-theme', theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <img src="/tadreex.png" alt="Tadreex" className={styles.logoImg} />
          <span>Tadreex</span>
        </div>
        <nav className={styles.nav}>
          <a href="/admin" className={styles.navItem}>
            <img src="/overview.png" alt="Overview" className={styles.navIcon} /> Overview
          </a>
          <a href="/admin/projects" className={styles.navItem}>
            <img src="/projects.png" alt="Projects" className={styles.navIcon} /> Projects
          </a>
          <a href="/admin/fields" className={styles.navItem}>
            <img src="/chat-fields.png" alt="Chat Fields" className={styles.navIcon} /> Chat Fields
          </a>
          <a href="/admin/scenario-fields" className={styles.navItem}>
            <img src="/scenario.png" alt="Scenario Fields" className={styles.navIcon} /> Scenario Fields
          </a>
          <a href="/admin/users" className={styles.navItem}>
            <img src="/uers.png" alt="Users" className={styles.navIcon} /> Users
          </a>
        </nav>
        <div className={styles.sidebarFooter}>
          <button onClick={toggle} className={styles.themeToggle}>
            <img src="/night-light-mode.png" alt="Theme" className={styles.themeIcon} /> {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </aside>

      <main className={styles.content}>{children}</main>
    </div>
  );
}
