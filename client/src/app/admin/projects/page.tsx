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

  // Create
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  // Rename
  const [renameTarget, setRenameTarget] = useState<Project | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [renaming, setRenaming] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { fetchProjects(); }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/admin/projects');
      if (res.ok) setProjects(await res.json());
    } catch (e) { console.error('Failed to fetch projects', e); }
    finally { setLoading(false); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/admin/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      if (res.ok) { setNewTitle(''); setShowCreate(false); fetchProjects(); }
    } catch (e) { console.error('Failed to create project', e); }
    finally { setCreating(false); }
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameTitle.trim()) return;
    setRenaming(true);
    try {
      const res = await fetch(`/api/admin/projects/${renameTarget._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: renameTitle }),
      });
      if (res.ok) { setRenameTarget(null); fetchProjects(); }
    } catch (e) { console.error('Failed to rename project', e); }
    finally { setRenaming(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/projects/${deleteTarget._id}`, { method: 'DELETE' });
      if (res.ok) { setDeleteTarget(null); fetchProjects(); }
    } catch (e) { console.error('Failed to delete project', e); }
    finally { setDeleting(false); }
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
        <button className={styles.createBtn} onClick={() => setShowCreate(true)}>
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
                    <button onClick={() => copyLink(project.clientToken)} className={styles.copyBtn} title="Copy Client Link">🔗 Copy Link</button>
                    <button onClick={() => { setRenameTarget(project); setRenameTitle(project.title); }} className={styles.actionBtn}>✎ Rename</button>
                    <button onClick={() => setDeleteTarget(project)} className={`${styles.actionBtn} ${styles.dangerBtn}`}>🗑 Delete</button>
                    <Link href={`/admin/projects/${project._id}`} className={styles.editBtn}>Edit →</Link>
                  </td>
                </tr>
              ))}
              {projects.length === 0 && (
                <tr><td colSpan={4} className={styles.emptyState}>No projects found. Create one to get started!</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className={styles.modalOverlay} onClick={() => setShowCreate(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2>Create New Project</h2>
            <form onSubmit={handleCreate}>
              <div className={styles.formGroup}>
                <label>Project Title</label>
                <input type="text" required autoFocus placeholder="e.g. Acme Corp Onboarding" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} disabled={creating} />
              </div>
              <div className={styles.modalActions}>
                <button type="button" onClick={() => setShowCreate(false)} className={styles.cancelBtn}>Cancel</button>
                <button type="submit" className={styles.saveBtn} disabled={creating || !newTitle.trim()}>{creating ? 'Creating...' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <div className={styles.modalOverlay} onClick={() => setRenameTarget(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2>Rename Project</h2>
            <form onSubmit={handleRename}>
              <div className={styles.formGroup}>
                <label>Project Title</label>
                <input type="text" required autoFocus value={renameTitle} onChange={(e) => setRenameTitle(e.target.value)} disabled={renaming} />
              </div>
              <div className={styles.modalActions}>
                <button type="button" onClick={() => setRenameTarget(null)} className={styles.cancelBtn}>Cancel</button>
                <button type="submit" className={styles.saveBtn} disabled={renaming || !renameTitle.trim()}>{renaming ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className={styles.modalOverlay} onClick={() => setDeleteTarget(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2>Delete Project</h2>
            <p style={{ marginBottom: '1.5rem', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
              Are you sure you want to delete <strong>{deleteTarget.title}</strong>? This action is irreversible.
            </p>
            <div className={styles.modalActions}>
              <button onClick={() => setDeleteTarget(null)} className={styles.cancelBtn}>Cancel</button>
              <button onClick={handleDelete} className={styles.deleteBtn} disabled={deleting}>{deleting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
