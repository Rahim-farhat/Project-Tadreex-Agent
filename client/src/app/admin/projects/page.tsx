'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from './projects.module.css';

interface Project {
  _id: string;
  title: string;
  status: string;
  clientToken: string;
  createdAt: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/admin/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (error) {
      console.error('Failed to fetch projects', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      if (res.ok) {
        setNewTitle('');
        setShowModal(false);
        fetchProjects(); // Refresh list
      }
    } catch (error) {
      console.error('Failed to create project', error);
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = (token: string) => {
    const link = `${window.location.origin}/chat/${token}`;
    navigator.clipboard.writeText(link);
    alert('Client link copied to clipboard!');
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Projects</h1>
          <p className={styles.subtitle}>Manage all client projects</p>
        </div>
        <button className={styles.createBtn} onClick={() => setShowModal(true)}>
          + New Project
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading projects...</div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Created At</th>
                <th className={styles.actionsCol}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project._id}>
                  <td>
                    <Link href={`/admin/projects/${project._id}`} className={styles.projectLink}>
                      {project.title}
                    </Link>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${styles[project.status]}`}>
                      {project.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td>{new Date(project.createdAt).toLocaleDateString()}</td>
                  <td className={styles.actionsCol}>
                    <button 
                      onClick={() => copyLink(project.clientToken)}
                      className={styles.copyBtn}
                      title="Copy Client Link"
                    >
                      🔗 Copy Link
                    </button>
                    <Link href={`/admin/projects/${project._id}`} className={styles.editBtn}>
                      Edit →
                    </Link>
                  </td>
                </tr>
              ))}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={4} className={styles.emptyState}>
                    No projects found. Create one to get started!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2>Create New Project</h2>
            <form onSubmit={handleCreate}>
              <div className={styles.formGroup}>
                <label>Project Title</label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Acme Corp Onboarding"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className={styles.modalActions}>
                <button type="button" onClick={() => setShowModal(false)} className={styles.cancelBtn}>
                  Cancel
                </button>
                <button type="submit" className={styles.saveBtn} disabled={submitting || !newTitle.trim()}>
                  {submitting ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
