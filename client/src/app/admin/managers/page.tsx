'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { adminFetch, errorMessage } from '@/lib/api';
import { useToast } from '@/components/useToast';
import { Icon } from '@/components/Icon';
import styles from './managers.module.css';

interface ManagerProject {
  _id: string;
  title: string;
  status: 'draft' | 'in_progress' | 'completed';
  clientToken: string;
  createdAt: string;
}

interface Manager {
  _id: string;
  name: string;
  username: string;
  email: string;
  role: 'manager';
  createdAt: string;
  projectCount: number;
  projects: ManagerProject[];
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  in_progress: 'In progress',
  completed: 'Completed',
};

export default function ManagersPage() {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Add Manager modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [addError, setAddError] = useState('');
  const [creating, setCreating] = useState(false);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<Manager | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { toast, Toast } = useToast();

  const fetchManagers = async () => {
    try {
      const res = await adminFetch('/api/admin/managers');
      if (res.ok) {
        setManagers(await res.json());
        setLoadError('');
      } else {
        setLoadError(await errorMessage(res, 'Failed to load managers'));
      }
    } catch {
      setLoadError('Cannot reach the server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchManagers();
  }, []);

  const filteredManagers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return managers;
    return managers.filter(
      (m) =>
        m.username.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q),
    );
  }, [managers, search]);

  const totalProjects = useMemo(() => {
    return managers.reduce((sum, m) => sum + (m.projectCount || 0), 0);
  }, [managers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');

    const trimmedUser = newUsername.trim();
    if (!trimmedUser) {
      setAddError('Username is required');
      return;
    }
    if (trimmedUser.length < 3) {
      setAddError('Username must be at least 3 characters');
      return;
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(trimmedUser)) {
      setAddError('Username can only contain letters, numbers, dots, and hyphens');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setAddError('Password must be at least 6 characters');
      return;
    }

    setCreating(true);
    try {
      const res = await adminFetch('/api/admin/managers', {
        method: 'POST',
        body: JSON.stringify({
          username: trimmedUser,
          password: newPassword,
        }),
      });

      if (res.ok) {
        toast(`Manager "${trimmedUser}" created`);
        setNewUsername('');
        setNewPassword('');
        setShowAddModal(false);
        fetchManagers();
      } else {
        setAddError(await errorMessage(res, 'Failed to create manager'));
      }
    } catch {
      setAddError('Cannot reach the server.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await adminFetch(`/api/admin/managers/${deleteTarget._id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast(`Manager "${deleteTarget.username}" deleted`);
        setDeleteTarget(null);
        fetchManagers();
      } else {
        toast(await errorMessage(res, 'Failed to delete manager'), 'error');
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
      toast('Client link copied');
    } catch {
      window.prompt('Copy client link:', link);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Managers</h1>
          <p className={styles.subtitle}>
            Create manager accounts and set their sign-in credentials. Each manager can enter the
            platform and create up to 10 projects.
          </p>
        </div>
        <button className={styles.addBtn} onClick={() => setShowAddModal(true)}>
          <Icon name="plus" size={16} /> Add Manager
        </button>
      </div>

      {/* Metrics */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statTop}>
            <span className={styles.statLabel}>Total Managers</span>
            <span className={styles.statIcon}><Icon name="users" size={16} /></span>
          </div>
          <div className={styles.statValue}>{managers.length}</div>
          <div className={styles.statDesc}>Registered platform managers</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statTop}>
            <span className={styles.statLabel}>Manager Projects</span>
            <span className={styles.statIcon}><Icon name="projects" size={16} /></span>
          </div>
          <div className={styles.statValue}>{totalProjects}</div>
          <div className={styles.statDesc}>Created by all managers combined</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statTop}>
            <span className={styles.statLabel}>Project Quota</span>
            <span className={styles.statIcon}><Icon name="sparkles" size={16} /></span>
          </div>
          <div className={styles.statValue}>10 / mgr</div>
          <div className={styles.statDesc}>Max projects allowed per manager</div>
        </div>
      </div>

      {/* Search */}
      {!loading && managers.length > 0 && (
        <div className={styles.searchBar}>
          <Icon name="search" size={16} />
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search managers by username…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className={styles.loadingBox}>Loading managers…</div>
      ) : loadError ? (
        <div className={styles.emptyBox}>
          <p style={{ color: 'var(--color-danger)' }}>{loadError}</p>
          <button className={styles.addBtn} onClick={() => { setLoading(true); fetchManagers(); }}>
            Retry
          </button>
        </div>
      ) : managers.length === 0 ? (
        <div className={styles.emptyBox}>
          <div className={styles.emptyIcon}>👥</div>
          <h2 className={styles.emptyTitle}>No managers yet</h2>
          <p className={styles.emptyText}>
            Add your first manager account with a username and password. They will be able to sign in
            and manage up to 10 projects.
          </p>
          <button className={styles.addBtn} onClick={() => setShowAddModal(true)}>
            <Icon name="plus" size={16} /> Add Manager
          </button>
        </div>
      ) : (
        <div className={styles.managersList}>
          {filteredManagers.map((manager) => {
            const isExpanded = expandedId === manager._id;
            const quotaPercent = Math.min(100, Math.round(((manager.projectCount || 0) / 10) * 100));

            return (
              <div key={manager._id} className={styles.managerCard}>
                <div className={styles.managerMain}>
                  <div className={styles.managerInfo}>
                    <div className={styles.avatar}>
                      {manager.username.charAt(0).toUpperCase()}
                    </div>
                    <div className={styles.details}>
                      <div className={styles.usernameRow}>
                        <span className={styles.username}>@{manager.username}</span>
                        <span className={styles.roleBadge}>Manager</span>
                      </div>
                      <span className={styles.date}>
                        Created on {new Date(manager.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Quota Progress */}
                  <div className={styles.quotaSection}>
                    <div className={styles.quotaLabel}>
                      <span>Projects used</span>
                      <span className={styles.quotaCount}>{manager.projectCount || 0} / 10</span>
                    </div>
                    <div className={styles.progressBarBg}>
                      <div
                        className={`${styles.progressBarFill} ${
                          (manager.projectCount || 0) >= 10 ? styles.progressBarFull : ''
                        }`}
                        style={{ width: `${quotaPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className={styles.managerActions}>
                    <button
                      className={styles.expandBtn}
                      onClick={() => setExpandedId(isExpanded ? null : manager._id)}
                    >
                      <Icon name={isExpanded ? 'chevronUp' : 'chevronDown'} size={14} />
                      {isExpanded ? 'Hide Projects' : `View Projects (${manager.projectCount || 0})`}
                    </button>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => setDeleteTarget(manager)}
                      title="Delete manager"
                    >
                      <Icon name="trash" size={14} /> Delete
                    </button>
                  </div>
                </div>

                {/* Expanded Projects Section */}
                {isExpanded && (
                  <div className={styles.projectsSection}>
                    <h3 className={styles.projectsTitle}>
                      Projects created by @{manager.username} ({manager.projects?.length || 0})
                    </h3>
                    {manager.projects && manager.projects.length > 0 ? (
                      <div className={styles.projectsGrid}>
                        {manager.projects.map((proj) => (
                          <div key={proj._id} className={styles.projectItem}>
                            <div className={styles.projectItemTop}>
                              <Link
                                href={`/admin/projects/${proj._id}`}
                                className={styles.projectTitle}
                                title={proj.title}
                              >
                                {proj.title}
                              </Link>
                              <span className={`${styles.badge} ${styles[proj.status] || ''}`}>
                                {STATUS_LABEL[proj.status] || proj.status}
                              </span>
                            </div>
                            <div className={styles.projectItemFoot}>
                              <span>{new Date(proj.createdAt).toLocaleDateString()}</span>
                              <button
                                onClick={() => copyLink(proj.clientToken)}
                                className={styles.copyClientBtn}
                                title="Copy client chat link"
                              >
                                <Icon name="link" size={12} /> Copy link
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.noProjectsMsg}>
                        This manager has not created any projects yet. (0 / 10 used)
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Manager Modal */}
      {showAddModal && (
        <div className={styles.overlay} onClick={() => setShowAddModal(false)}>
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-mgr-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 id="add-mgr-title" className={styles.modalTitle}>
                Add New Manager
              </h2>
              <p className={styles.modalDesc}>
                Set up their sign-in credentials. Managers can enter the platform and create up to 10
                projects.
              </p>
            </div>

            <form onSubmit={handleCreate} className={styles.modalForm}>
              {addError && <div className={styles.modalError}>{addError}</div>}

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="mgr-username">
                  Username
                </label>
                <input
                  id="mgr-username"
                  className={styles.input}
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. sarah_manager"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  disabled={creating}
                />
                <span className={styles.inputHint}>
                  Used to sign into the platform. Letters, numbers, hyphens, and dots.
                </span>
              </div>

              <div className={styles.formGroup}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className={styles.label} htmlFor="mgr-password">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-accent)',
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                    }}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  id="mgr-password"
                  className={styles.input}
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={creating}
                />
                <span className={styles.inputHint}>Minimum 6 characters.</span>
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setShowAddModal(false)}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.confirmBtn} disabled={creating}>
                  {creating ? 'Creating…' : 'Create Manager'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className={styles.overlay} onClick={() => setDeleteTarget(null)}>
          <div
            className={styles.modal}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="del-mgr-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 id="del-mgr-title" className={styles.modalTitle}>
                Delete Manager
              </h2>
              <p className={styles.modalDesc}>
                Are you sure you want to delete manager <strong>@{deleteTarget.username}</strong>?
                {deleteTarget.projectCount > 0 && (
                  <span>
                    {' '}
                    This manager has created{' '}
                    <strong>{deleteTarget.projectCount} project(s)</strong>.
                  </span>
                )}
              </p>
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmDeleteBtn}
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete Manager'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast />
    </div>
  );
}
