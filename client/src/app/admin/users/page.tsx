'use client';

import styles from './users.module.css';

export default function UsersPage() {
  return (
    <div>
      <h1 className={styles.title}>Users</h1>
      <p className={styles.subtitle}>Manage all registered users on the platform.</p>

      <div className={styles.placeholder}>
        <span className={styles.placeholderIcon}>👥</span>
        <p>User management coming soon.</p>
      </div>
    </div>
  );
}
