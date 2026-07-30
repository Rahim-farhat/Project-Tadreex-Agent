import styles from './dashboard.module.css';

export default function AdminOverviewPage() {
  return (
    <div>
      <h1 className={styles.heading}>Dashboard Overview</h1>
      <p className={styles.subtitle}>Welcome to the Tadreex admin panel.</p>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>👥</div>
          <div className={styles.statLabel}>Total Users</div>
          <div className={styles.statValue}>—</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>💬</div>
          <div className={styles.statLabel}>Conversations</div>
          <div className={styles.statValue}>—</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>🤖</div>
          <div className={styles.statLabel}>AI Messages Sent</div>
          <div className={styles.statValue}>—</div>
        </div>
      </div>

      <div className={styles.quickLinks}>
        <a href="/admin/users" className={styles.quickLink}>Manage Users →</a>
        <a href="/admin/conversations" className={styles.quickLink}>View Conversations →</a>
      </div>
    </div>
  );
}
