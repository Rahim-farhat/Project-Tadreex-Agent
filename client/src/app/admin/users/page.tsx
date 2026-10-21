'use client';

import { useEffect, useState } from 'react';
import { adminFetch, errorMessage, getToken } from '@/lib/api';
import { useToast } from '@/components/useToast';
import styles from './users.module.css';

interface User {
  _id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: string;
}

// Reads the user id from the JWT payload (display only — the server re-checks)
function currentUserId(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.id ?? null;
  } catch {
    return null;
  }
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const { toast, Toast } = useToast();

  const fetchUsers = async () => {
    try {
      const res = await adminFetch('/api/admin/users');
      if (res.ok) {
        setUsers(await res.json());
        setLoadError('');
      } else {
        setLoadError(await errorMessage(res, 'Failed to load users'));
      }
    } catch {
      setLoadError('Cannot reach the server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMeId(currentUserId());
    fetchUsers();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await adminFetch(`/api/admin/users/${deleteTarget._id}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteTarget(null);
        toast('User deleted');
        fetchUsers();
      } else {
        toast(await errorMessage(res, 'Delete failed'), 'error');
      }
    } catch {
      toast('Cannot reach the server.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <h1 className={styles.title}>Users</h1>
      <p className={styles.subtitle}>Manage all registered users on the platform.</p>

      {loading ? (
        <div className={styles.placeholder}>Loading users…</div>
      ) : loadError ? (
        <div className={styles.errorBox}>{loadError}</div>
      ) : users.length === 0 ? (
        <div className={styles.placeholder}>
          <span className={styles.placeholderIcon}>👥</span>
          <p>No users yet.</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {users.map((u) => {
            const isMe = u._id === meId;
            return (
              <li key={u._id} className={styles.row}>
                <div className={styles.avatar} aria-hidden>
                  {(u.name || u.email).charAt(0).toUpperCase()}
                </div>
                <div className={styles.info}>
                  <div className={styles.name}>
                    {u.name}
                    {isMe && <span className={styles.youTag}>You</span>}
                  </div>
                  <div className={styles.email}>{u.email}</div>
                </div>
                <span className={`${styles.role} ${u.role === 'admin' ? styles.roleAdmin : ''}`}>
                  {u.role}
                </span>
                <span className={styles.date}>{new Date(u.createdAt).toLocaleDateString()}</span>
                <button
                  className={styles.deleteBtn}
                  onClick={() => setDeleteTarget(u)}
                  disabled={isMe}
                  title={isMe ? 'You cannot delete your own account' : 'Delete user'}
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {deleteTarget && (
        <div className={styles.overlay} onClick={() => setDeleteTarget(null)}>
          <div
            className={styles.modal}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="del-user-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="del-user-title">Delete user</h2>
            <p>
              Delete <strong>{deleteTarget.name}</strong> ({deleteTarget.email})? This cannot be undone.
            </p>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className={styles.confirmBtn} onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast />
    </div>
  );
}
