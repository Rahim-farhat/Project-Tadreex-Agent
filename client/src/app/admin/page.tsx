'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { adminFetch, getCurrentUser, SessionUser } from '@/lib/api';
import { Icon } from '@/components/Icon';
import styles from './dashboard.module.css';

interface ProjectSummary {
  _id: string;
  title: string;
  status: 'draft' | 'in_progress' | 'completed';
  updatedAt?: string;
  createdAt: string;
}

interface Stats {
  projects: ProjectSummary[];
  chatFields: number;
  scenarioFields: number;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  in_progress: 'In progress',
  completed: 'Completed',
};

async function getJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await adminFetch(url);
    return res.ok ? await res.json() : fallback;
  } catch {
    return fallback;
  }
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    const curr = getCurrentUser();
    setUser(curr);

    if (curr?.role === 'manager') {
      getJson<ProjectSummary[]>('/api/admin/projects', []).then((projects) => {
        setStats({ projects, chatFields: 0, scenarioFields: 0 });
      });
    } else {
      Promise.all([
        getJson<ProjectSummary[]>('/api/admin/projects', []),
        getJson<unknown[]>('/api/admin/chatfields', []),
        getJson<unknown[]>('/api/admin/scenario-fields', []),
      ]).then(([projects, chatFields, scenarioFields]) =>
        setStats({ projects, chatFields: chatFields.length, scenarioFields: scenarioFields.length }),
      );
    }
  }, []);

  const count = (status: string) => stats?.projects.filter((p) => p.status === status).length ?? 0;
  const recent = stats
    ? [...stats.projects]
        .sort((a, b) => +new Date(b.updatedAt || b.createdAt) - +new Date(a.updatedAt || a.createdAt))
        .slice(0, 5)
    : [];
  const value = (n: number | undefined) => (stats ? n : <span className={styles.skeleton} />);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.heading}>Overview</h1>
          <p className={styles.subtitle}>Training scenarios your clients are designing with the assistant.</p>
        </div>
        <Link href="/admin/projects" className={styles.primaryBtn}>
          <Icon name="plus" size={16} /> New project
        </Link>
      </header>

      <div className={styles.statsGrid}>
        <Link href="/admin/projects" className={styles.statCard}>
          <div className={styles.statTop}>
            <span className={styles.statLabel}>Projects</span>
            <span className={styles.statIcon}><Icon name="projects" size={16} /></span>
          </div>
          <div className={styles.statValue}>{value(stats?.projects.length)}</div>
          <div className={styles.statFoot}>{stats ? `${count('draft')} not started yet` : ' '}</div>
        </Link>
        <Link href="/admin/projects" className={styles.statCard}>
          <div className={styles.statTop}>
            <span className={styles.statLabel}>In progress</span>
            <span className={`${styles.statIcon} ${styles.iconWarn}`}><Icon name="progress" size={16} /></span>
          </div>
          <div className={styles.statValue}>{value(count('in_progress'))}</div>
          <div className={styles.statFoot}>Clients building scenarios</div>
        </Link>
        <Link href="/admin/projects" className={styles.statCard}>
          <div className={styles.statTop}>
            <span className={styles.statLabel}>Completed</span>
            <span className={`${styles.statIcon} ${styles.iconOk}`}><Icon name="done" size={16} /></span>
          </div>
          <div className={styles.statValue}>{value(count('completed'))}</div>
          <div className={styles.statFoot}>
            {stats && stats.projects.length > 0
              ? `${Math.round((count('completed') / stats.projects.length) * 100)}% completion rate`
              : ' '}
          </div>
        </Link>
        {user?.role === 'manager' ? (
          <Link href="/admin/projects" className={styles.statCard}>
            <div className={styles.statTop}>
              <span className={styles.statLabel}>Project Quota</span>
              <span className={styles.statIcon}><Icon name="sparkles" size={16} /></span>
            </div>
            <div className={styles.statValue}>
              {value(stats ? stats.projects.length : undefined)} / 10
            </div>
            <div className={styles.statFoot}>
              {stats ? `${Math.max(0, 10 - stats.projects.length)} slots available` : ' '}
            </div>
          </Link>
        ) : (
          <Link href="/admin/fields" className={styles.statCard}>
            <div className={styles.statTop}>
              <span className={styles.statLabel}>Question fields</span>
              <span className={styles.statIcon}><Icon name="chat" size={16} /></span>
            </div>
            <div className={styles.statValue}>
              {value(stats ? stats.chatFields + stats.scenarioFields : undefined)}
            </div>
            <div className={styles.statFoot}>
              {stats ? `${stats.chatFields} chat · ${stats.scenarioFields} scenario` : ' '}
            </div>
          </Link>
        )}
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Recently updated</h2>
          <Link href="/admin/projects" className={styles.panelLink}>View all <Icon name="arrowRight" size={14} /></Link>
        </div>
        {!stats ? (
          <div className={styles.panelEmpty}>Loading…</div>
        ) : recent.length === 0 ? (
          <div className={styles.panelEmpty}>
            No projects yet. <Link href="/admin/projects" className={styles.panelLink}>Create one →</Link>
          </div>
        ) : (
          <ul className={styles.recentList}>
            {recent.map((p) => (
              <li key={p._id}>
                <Link href={`/admin/projects/${p._id}`} className={styles.recentItem}>
                  <span className={styles.recentTitle}>{p.title}</span>
                  <span className={`${styles.statusPill} ${styles[p.status] || ''}`}>
                    {STATUS_LABEL[p.status] || p.status}
                  </span>
                  <span className={styles.recentDate}>
                    {new Date(p.updatedAt || p.createdAt).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
