import type { Metadata } from 'next';
import styles from './admin.module.css';

export const metadata: Metadata = {
  title: 'Admin Dashboard | Tadreex Agent',
  description: 'Manage users, conversations, and platform settings.',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <span>🎓</span>
          <span>Tadreex</span>
        </div>
        <nav className={styles.nav}>
          <a href="/admin" className={styles.navItem}>
            <span>📊</span> Overview
          </a>
          <a href="/admin/projects" className={styles.navItem}>
            <span>📁</span> Projects
          </a>
          <a href="/admin/fields" className={styles.navItem}>
            <span>🧩</span> Chat Fields
          </a>
          <a href="/admin/scenario-fields" className={styles.navItem}>
            <span>🎬</span> Scenario Fields
          </a>
          <a href="/admin/users" className={styles.navItem}>
            <span>👥</span> Users
          </a>
          <a href="/admin/conversations" className={styles.navItem}>
            <span>💬</span> Conversations
          </a>
        </nav>
        <div className={styles.sidebarFooter}>
          <a href="/chat" className={styles.navItem}>
            <span>←</span> Back to Chat
          </a>
        </div>
      </aside>

      {/* Main content area */}
      <main className={styles.content}>{children}</main>
    </div>
  );
}
