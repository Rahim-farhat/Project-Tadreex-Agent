import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Users | Tadreex Admin',
};

export default function UsersPage() {
  return (
    <div>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.4rem' }}>
        Users
      </h1>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '2rem' }}>
        Manage all registered users on the platform.
      </p>

      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        padding: '2rem',
        color: 'var(--color-text-muted)',
        textAlign: 'center',
      }}>
        👥 User list will appear here once connected to the API.
        <br />
        <code style={{ fontSize: '0.8rem', opacity: 0.6 }}>GET /api/admin/users</code>
      </div>
    </div>
  );
}
