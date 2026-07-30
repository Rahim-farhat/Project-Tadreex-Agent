'use client';

import { useState, useEffect } from 'react';
import styles from './scenario-fields.module.css';

interface ScenarioField {
  _id: string;
  label: string;
  description: string;
  type: 'text' | 'radio' | 'checkbox';
  options: string[];
  required: boolean;
  order: number;
  active: boolean;
  createdAt: string;
}

const EMPTY_FIELD: Omit<ScenarioField, '_id' | 'createdAt'> = {
  label: '',
  description: '',
  type: 'text',
  options: [],
  required: true,
  order: 0,
  active: true,
};

export default function ScenarioFieldsPage() {
  const [fields, setFields] = useState<ScenarioField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingField, setEditingField] = useState<ScenarioField | null>(null);
  const [form, setForm] = useState(EMPTY_FIELD);
  const [newOption, setNewOption] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ScenarioField | null>(null);

  useEffect(() => { fetchFields(); }, []);

  const fetchFields = async () => {
    try {
      const res = await fetch('/api/admin/scenario-fields');
      if (res.ok) setFields(await res.json());
    } catch (e) { console.error('Failed to fetch scenario fields', e); }
    finally { setLoading(false); }
  };

  const openCreate = () => {
    setEditingField(null);
    setForm({ ...EMPTY_FIELD, order: fields.length });
    setNewOption('');
    setShowModal(true);
  };

  const openEdit = (field: ScenarioField) => {
    setEditingField(field);
    setForm({
      label: field.label, description: field.description, type: field.type,
      options: [...field.options], required: field.required, order: field.order, active: field.active,
    });
    setNewOption('');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.label.trim()) return;
    setSubmitting(true);
    try {
      if (editingField) {
        const res = await fetch(`/api/admin/scenario-fields/${editingField._id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
        });
        if (res.ok) { setShowModal(false); fetchFields(); }
      } else {
        const res = await fetch('/api/admin/scenario-fields', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
        });
        if (res.ok) { setShowModal(false); fetchFields(); }
      }
    } catch (e) { console.error('Failed to save field', e); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/admin/scenario-fields/${deleteTarget._id}`, { method: 'DELETE' });
      if (res.ok) { setDeleteTarget(null); fetchFields(); }
    } catch (e) { console.error('Failed to delete field', e); }
  };

  const addOption = () => {
    if (newOption.trim() && !form.options.includes(newOption.trim())) {
      setForm((prev) => ({ ...prev, options: [...prev.options, newOption.trim()] }));
      setNewOption('');
    }
  };

  const removeOption = (idx: number) => {
    setForm((prev) => ({ ...prev, options: prev.options.filter((_, i) => i !== idx) }));
  };

  const typeBadge = (type: string) => {
    if (type === 'text') return <span className={`${styles.badge} ${styles.badgeText}`}>Texte</span>;
    if (type === 'radio') return <span className={`${styles.badge} ${styles.badgeRadio}`}>Choix unique</span>;
    return <span className={`${styles.badge} ${styles.badgeCheckbox}`}>Choix multiple</span>;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Champs des Scénarios</h1>
          <p className={styles.subtitle}>Questions posées par scénario dans la Phase 2 du chatbot.</p>
        </div>
        <button className={styles.createBtn} onClick={openCreate}>+ Nouveau champ</button>
      </div>

      {loading ? (
        <div className={styles.loading}>Chargement...</div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Intitulé</th>
                <th>Type</th>
                <th>Options</th>
                <th>Statut</th>
                <th className={styles.actionsCol}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, idx) => (
                <tr key={field._id}>
                  <td>{idx + 1}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{field.label}</div>
                    {field.description && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                        {field.description}
                      </div>
                    )}
                  </td>
                  <td>{typeBadge(field.type)}</td>
                  <td>
                    {field.options.length > 0 ? (
                      <div className={styles.optionsList}>
                        {field.options.map((opt) => (
                          <span key={opt} className={styles.optionTag}>{opt}</span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>—</span>
                    )}
                  </td>
                  <td>
                    <span className={`${styles.badge} ${field.active ? styles.badgeActive : styles.badgeInactive}`}>
                      {field.active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className={styles.actionsCol}>
                    <button className={styles.actionBtn} onClick={() => openEdit(field)}>Modifier</button>
                    <button className={`${styles.actionBtn} ${styles.danger}`} onClick={() => setDeleteTarget(field)}>Supprimer</button>
                  </td>
                </tr>
              ))}
              {fields.length === 0 && (
                <tr><td colSpan={6} className={styles.emptyState}>Aucun champ de scénario configuré.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2>{editingField ? 'Modifier le champ' : 'Nouveau champ'}</h2>
            <form onSubmit={handleSave}>
              <div className={styles.formGroup}>
                <label>Intitulé *</label>
                <input type="text" required autoFocus placeholder="ex: Objectif du scénario" value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} disabled={submitting} />
              </div>
              <div className={styles.formGroup}>
                <label>Description (utilisée par le chatbot pour préciser la question)</label>
                <input type="text" placeholder="ex: Décris précisément l'information à collecter" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} disabled={submitting} />
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Type de réponse</label>
                  <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as 'text' | 'radio' | 'checkbox', options: e.target.value === 'text' ? [] : p.options }))} disabled={submitting}>
                    <option value="text">Texte libre</option>
                    <option value="radio">Choix unique</option>
                    <option value="checkbox">Choix multiple</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>Obligatoire</label>
                  <div className={styles.toggleWrapper} style={{ marginTop: '0.5rem' }}>
                    <div className={`${styles.toggle} ${form.required ? styles.active : ''}`} onClick={() => setForm((p) => ({ ...p, required: !p.required }))} />
                    <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{form.required ? 'Oui' : 'Non'}</span>
                  </div>
                </div>
              </div>
              {(form.type === 'radio' || form.type === 'checkbox') && (
                <div className={styles.formGroup}>
                  <label>Options</label>
                  <div className={styles.optionsEditor}>
                    {form.options.map((opt, idx) => (
                      <div key={idx} className={styles.optionRow}>
                        <input type="text" value={opt} onChange={(e) => { const o = [...form.options]; o[idx] = e.target.value; setForm((p) => ({ ...p, options: o })); }} disabled={submitting} />
                        <button type="button" className={styles.removeOptionBtn} onClick={() => removeOption(idx)} disabled={submitting}>×</button>
                      </div>
                    ))}
                    <div className={styles.optionRow}>
                      <input type="text" placeholder="Ajouter..." value={newOption} onChange={(e) => setNewOption(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }} disabled={submitting} />
                      <button type="button" className={styles.addOptionBtn} onClick={addOption} disabled={submitting || !newOption.trim()}>+</button>
                    </div>
                  </div>
                </div>
              )}
              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)} disabled={submitting}>Annuler</button>
                <button type="submit" className={styles.saveBtn} disabled={submitting || !form.label.trim()}>
                  {submitting ? 'Enregistrement...' : editingField ? 'Enregistrer' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className={styles.confirmOverlay} onClick={() => setDeleteTarget(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <h3>Supprimer le champ</h3>
            <p>Voulez-vous supprimer <strong>{deleteTarget.label}</strong> ?</p>
            <div className={styles.confirmActions}>
              <button className={styles.cancelBtn} onClick={() => setDeleteTarget(null)}>Annuler</button>
              <button className={styles.confirmDeleteBtn} onClick={handleDelete}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
