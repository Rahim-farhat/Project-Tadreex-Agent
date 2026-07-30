'use client';

import { useState, useEffect } from 'react';
import styles from './dashboard.module.css';

export default function AdminOverviewPage() {
  const [projectCount, setProjectCount] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/admin/projects')
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setProjectCount(data.length))
      .catch(() => {});
  }, []);

  return (
    <div>
      <h1 className={styles.heading}>Dashboard Overview</h1>
      <p className={styles.subtitle}>Welcome to the Tadreex admin panel.</p>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>📁</div>
          <div className={styles.statLabel}>Total Projects</div>
          <div className={styles.statValue}>{projectCount !== null ? projectCount : '...'}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>🧩</div>
          <div className={styles.statLabel}>Chat Fields</div>
          <div className={styles.statValue}>
            <a href="/admin/fields" style={{ color: 'inherit' }}>Manage →</a>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>🎬</div>
          <div className={styles.statLabel}>Scenario Fields</div>
          <div className={styles.statValue}>
            <a href="/admin/scenario-fields" style={{ color: 'inherit' }}>Manage →</a>
          </div>
        </div>
      </div>

      <div className={styles.quickLinks}>
        <a href="/admin/projects" className={styles.quickLink}>View All Projects →</a>
        <a href="/admin/fields" className={styles.quickLink}>Manage Chat Fields →</a>
      </div>
    </div>
  );
}
