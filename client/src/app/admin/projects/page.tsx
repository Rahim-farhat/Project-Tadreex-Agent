'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { adminFetch, errorMessage, getCurrentUser, SessionUser } from '@/lib/api';
import { useToast } from '@/components/useToast';
import { Icon } from '@/components/Icon';
import styles from './projects.module.css';

interface Project {
  _id: string;
  title: string;
  status: string;
  clientToken: string;
  createdAt: string;
  createdBy?: string;
  createdByName?: string;
  createdByUsername?: string;
  createdByRole?: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  in_progress: 'In progress',
  completed: 'Completed',
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [user, setUser] = useState<SessionUser | null>(null);
  const { toast, Toast } = useToast();

  const isManager = user?.role === 'manager';
  const isAdmin = user?.role === 'admin';
  const atLimit = isManager && projects.length >= 10;

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

  useEffect(() => {
    setUser(getCurrentUser());
    fetchProjects();
  }, []);

  // Close any open modal with Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setShowCreate(false);
      setRenameTarget(null);
      setDeleteTarget(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await adminFetch('/api/admin/projects');
      if (res.ok) {
        setProjects(await res.json());
        setLoadError('');
      } else {
        setLoadError(await errorMessage(res, 'Failed to load projects'));
      }
    } catch {
      setLoadError('Cannot reach the server.');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter(
      (p) =>
        (statusFilter === 'all' || p.status === statusFilter) &&
        (!q ||
          p.title.toLowerCase().includes(q) ||
          p.createdByUsername?.toLowerCase().includes(q) ||
          p.createdByName?.toLowerCase().includes(q)),
    );
  }, [projects, query, statusFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    if (atLimit) {
      toast('Project limit reached. Managers can create up to 10 projects.', 'error');
      return;
    }

    setCreating(true);
    try {
      const res = await adminFetch('/api/admin/projects', {
        method: 'POST',
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (res.ok) {
        setNewTitle('');
        setShowCreate(false);
        toast('Project created');
        fetchProjects();
      } else {
        toast(await errorMessage(res, 'Create failed'), 'error');
      }
    } catch {
      toast('Cannot reach the server.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameTitle.trim()) return;
    setRenaming(true);
    try {
      const res = await adminFetch(`/api/admin/projects/${renameTarget._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: renameTitle.trim() }),
      });
      if (res.ok) {
        setRenameTarget(null);
        toast('Project renamed');
        fetchProjects();
      } else {
        toast(await errorMessage(res, 'Rename failed'), 'error');
      }
    } catch {
      toast('Cannot reach the server.', 'error');
    } finally {
      setRenaming(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await adminFetch(`/api/admin/projects/${deleteTarget._id}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteTarget(null);
        toast('Project deleted');
        fetchProjects();
      } else {
        toast(await errorMessage(res, 'Delete failed'), 'error');
      }
    } catch {
      toast('Cannot reach the server.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const copyLink = async (token: string) => {
    const link = `${window.location.origin}/chat/${token}`;
    try {
      await navigator.clipboard.writeText(link);
      toast('Client link copied to clipboard');
    } catch {
      window.prompt('Copy the client link:', link);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Projects</h1>
          <p className={styles.subtitle}>
            {isManager
              ? 'Manage your training scenario projects. You can create up to 10 projects.'
              : 'Each project has a private link you share with the client.'}
          </p>
        </div>
        <div className={styles.headerActions}>
          {isManager && (
            <div className={`${styles.quotaPill} ${atLimit ? styles.quotaPillLimit : ''}`}>
              <Icon name="sparkles" size={14} />
              <span>Quota: {projects.length} / 10 used</span>
            </div>
          )}
          <button
            className={styles.createBtn}
            onClick={() => {
              if (atLimit) {
                toast('Project limit reached. Managers can create up to 10 projects.', 'error');
                return;
              }
              setShowCreate(true);
            }}
            disabled={atLimit}
            title={atLimit ? 'You have reached the maximum limit of 10 projects' : 'Create new project'}
          >
            <Icon name="plus" size={16} /> New project
          </button>
        </div>
      </div>

      {!loading && projects.length > 0 && (
        <div className={styles.toolbar}>
          <label className={styles.searchBox}>
          <Icon name="search" size={16} />
          <input
            type="search"
            className={styles.searchInput}
            placeholder={isAdmin ? "Search projects or creator…" : "Search projects…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search projects"
          />
          </label>
          <div className={styles.filterGroup} role="tablist" aria-label="Filter by status">
            {['all', 'draft', 'in_progress', 'completed'].map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={statusFilter === s}
                className={`${styles.filterBtn} ${statusFilter === s ? styles.filterBtnActive : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? `All (${projects.length})` : STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className={styles.loading}>Loading projects...</div>
      ) : loadError ? (
        <div className={styles.errorBox}>
          {loadError}
          <button className={styles.actionBtn} onClick={() => { setLoading(true); fetchProjects(); }}>
            Retry
          </button>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                {isAdmin && <th>Created by</th>}
                <th className={styles.dateCol}>Created</th>
                <th className={styles.actionsCol}><span className={styles.srOnly}>Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((project) => (
                <tr key={project._id}>
                  <td data-label="Title">
                    <Link href={`/admin/projects/${project._id}`} className={styles.projectLink}>
                      {project.title}
                    </Link>
                  </td>
                  <td data-label="Status">
                    <span className={`${styles.badge} ${styles[project.status] || ''}`}>
                      {STATUS_LABEL[project.status] || project.status}
                    </span>
                  </td>
                  {isAdmin && (
                    <td data-label="Created by">
                      {project.createdByRole === 'manager' ? (
                        <span className={styles.creatorBadgeManager} title={`Manager: @${project.createdByUsername || 'manager'}`}>
                          <Icon name="users" size={12} /> @{project.createdByUsername || 'manager'}
                        </span>
                      ) : (
                        <span className={styles.creatorBadgeAdmin} title="Admin project">
                          <Icon name="shield" size={12} /> Admin
                        </span>
                      )}
                    </td>
                  )}
                  <td className={styles.dateCol} data-label="Created">
                    {new Date(project.createdAt).toLocaleDateString()}
                  </td>
                  <td className={styles.actionsCol}>
                    <div className={styles.rowActions}>
                      <button onClick={() => copyLink(project.clientToken)} className={styles.copyBtn} title="Copy client link">
                        <Icon name="link" size={15} /> <span>Copy link</span>
                      </button>
                      <a href={`/chat/${project.clientToken}`} target="_blank" rel="noreferrer" className={styles.iconBtn} title="Open client chat" aria-label="Open client chat">
                        <Icon name="external" size={15} />
                      </a>
                      <button onClick={() => { setRenameTarget(project); setRenameTitle(project.title); }} className={styles.iconBtn} title="Rename" aria-label="Rename">
                        <Icon name="edit" size={15} />
                      </button>
                      <button onClick={() => setDeleteTarget(project)} className={`${styles.iconBtn} ${styles.dangerBtn}`} title="Delete" aria-label="Delete">
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className={styles.emptyState}>
                    {projects.length === 0
                      ? 'No projects yet. Create one to get started!'
                      : 'No projects match your search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className={styles.modalOverlay} onClick={() => setShowCreate(false)}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="create-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="create-title">Create New Project</h2>
            <form onSubmit={handleCreate}>
              <div className={styles.formGroup}>
                <label htmlFor="new-title">Project Title</label>
                <input id="new-title" type="text" required autoFocus placeholder="e.g. Acme Corp Onboarding" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} disabled={creating} />
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
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="rename-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="rename-title">Rename Project</h2>
            <form onSubmit={handleRename}>
              <div className={styles.formGroup}>
                <label htmlFor="rename-input">Project Title</label>
                <input id="rename-input" type="text" required autoFocus value={renameTitle} onChange={(e) => setRenameTitle(e.target.value)} disabled={renaming} />
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
          <div className={styles.modal} role="alertdialog" aria-modal="true" aria-labelledby="delete-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="delete-title">Delete Project</h2>
            <p className={styles.modalText}>
              Are you sure you want to delete <strong>{deleteTarget.title}</strong>? This action is irreversible.
            </p>
            <div className={styles.modalActions}>
              <button onClick={() => setDeleteTarget(null)} className={styles.cancelBtn}>Cancel</button>
              <button onClick={handleDelete} className={styles.deleteBtn} disabled={deleting}>{deleting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      <Toast />
    </div>
  );
}
