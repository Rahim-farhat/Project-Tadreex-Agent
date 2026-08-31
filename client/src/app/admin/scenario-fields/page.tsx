'use client';

import { useState, useEffect } from 'react';
import styles from './scenario-fields.module.css';

interface ScenarioField {
  _id: string;
  key: string;
  label: string;
  description: string;
  forbidden: string;
  type: 'text' | 'radio' | 'checkbox';
  options: string[];
  required: boolean;
  order: number;
  active: boolean;
  createdAt: string;
}

const EMPTY_FIELD: Omit<ScenarioField, '_id' | 'createdAt'> = {
  key: '',
  label: '',
  description: '',
  forbidden: '',
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

  useEffect(() => {
    fetchFields();
  }, []);

  const fetchFields = async () => {
    try {
      const res = await fetch('/api/admin/scenario-fields');
      if (res.ok) setFields(await res.json());
    } catch (e) {
      console.error('Failed to fetch scenario fields', e);
    } finally {
      setLoading(false);
    }
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
      key: field.key || '',
      label: field.label,
      description: field.description || '',
      forbidden: field.forbidden || '',
      type: field.type,
      options: [...(field.options || [])],
      required: field.required !== false,
      order: field.order,
      active: field.active !== false,
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
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          setShowModal(false);
          fetchFields();
        }
      } else {
        const res = await fetch('/api/admin/scenario-fields', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          setShowModal(false);
          fetchFields();
        }
      }
    } catch (e) {
      console.error('Failed to save field', e);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (field: ScenarioField) => {
    try {
      const res = await fetch(`/api/admin/scenario-fields/${field._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !field.active }),
      });
      if (res.ok) fetchFields();
    } catch (e) {
      console.error('Failed to toggle active status', e);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/admin/scenario-fields/${deleteTarget._id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setDeleteTarget(null);
        fetchFields();
      }
    } catch (e) {
      console.error('Failed to delete field', e);
    }
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

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Champs des Scénarios</h1>
          <p className={styles.subtitle}>
            Table de configuration des champs collectés pour chaque étape d&apos;un scénario. Le chatbot utilise directement ces définitions pour poser les questions, guider l&apos;aide et valider les réponses.
          </p>
        </div>
        <button className={styles.createBtn} onClick={openCreate}>
          + Nouveau champ
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}>Chargement...</div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: '40px' }}>#</th>
                <th style={{ width: '100px' }}>Clé</th>
                <th style={{ width: '180px' }}>Intitulé</th>
                <th>Ce qui est attendu</th>
                <th>Interdit dans l&apos;Aide</th>
                <th style={{ width: '90px' }}>Statut</th>
                <th className={styles.actionsCol} style={{ width: '140px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, idx) => (
                <tr key={field._id}>
                  <td>{idx + 1}</td>
                  <td>
                    <code style={{ background: 'var(--color-surface-2)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', color: 'var(--color-accent)' }}>
                      {field.key || field.label.toLowerCase()}
                    </code>
                  </td>
                  <td>
                    <strong style={{ fontSize: '0.95rem' }}>{field.label}</strong>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text)' }}>
                      {field.description || '—'}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.82rem', color: 'var(--color-danger, #ef4444)' }}>
                      {field.forbidden ? `⛔ ${field.forbidden}` : '—'}
                    </div>
                  </td>
                  <td>
                    <div className={styles.toggleWrapper}>
                      <div
                        className={`${styles.toggle} ${field.active ? styles.active : ''}`}
                        onClick={() => toggleActive(field)}
                        title={field.active ? 'Désactiver' : 'Activer'}
                      />
                    </div>
                  </td>
                  <td className={styles.actionsCol}>
                    <button className={styles.actionBtn} onClick={() => openEdit(field)}>
                      Modifier
                    </button>
                    <button
                      className={`${styles.actionBtn} ${styles.danger}`}
                      onClick={() => setDeleteTarget(field)}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
              {fields.length === 0 && (
                <tr>
                  <td colSpan={7} className={styles.emptyState}>
                    Aucun champ de scénario configuré.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div
            className={styles.modal}
            style={{ maxWidth: '600px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{editingField ? 'Modifier le champ de scénario' : 'Nouveau champ de scénario'}</h2>
            <form onSubmit={handleSave}>
              <div className={styles.formRow}>
                <div className={styles.formGroup} style={{ flex: 1 }}>
                  <label>Clé / Identifiant technique *</label>
                  <input
                    type="text"
                    required
                    placeholder="ex: titre, action, ui..."
                    value={form.key}
                    onChange={(e) => setForm((p) => ({ ...p, key: e.target.value }))}
                    disabled={submitting}
                  />
                </div>
                <div className={styles.formGroup} style={{ flex: 2 }}>
                  <label>Intitulé (affiché à l&apos;utilisateur) *</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="ex: Action gestuelle"
                    value={form.label}
                    onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Ce qui est attendu (définition utilisée pour la question &amp; la validation) *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="ex: Gestes physiques du joueur (contrôleurs VR, manipulation)"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  disabled={submitting}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Ce qui est formellement interdit dans l&apos;Aide</label>
                <input
                  type="text"
                  placeholder="ex: Éléments d'UI ou règles de validation"
                  value={form.forbidden}
                  onChange={(e) => setForm((p) => ({ ...p, forbidden: e.target.value }))}
                  disabled={submitting}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Type de réponse</label>
                  <select
                    value={form.type}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        type: e.target.value as 'text' | 'radio' | 'checkbox',
                        options: e.target.value === 'text' ? [] : p.options,
                      }))
                    }
                    disabled={submitting}
                  >
                    <option value="text">Texte libre</option>
                    <option value="radio">Choix unique</option>
                    <option value="checkbox">Choix multiple</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>Actif</label>
                  <div className={styles.toggleWrapper} style={{ marginTop: '0.5rem' }}>
                    <div
                      className={`${styles.toggle} ${form.active ? styles.active : ''}`}
                      onClick={() => setForm((p) => ({ ...p, active: !p.active }))}
                    />
                    <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                      {form.active ? 'Oui' : 'Non'}
                    </span>
                  </div>
                </div>
              </div>

              {(form.type === 'radio' || form.type === 'checkbox') && (
                <div className={styles.formGroup}>
                  <label>Options</label>
                  <div className={styles.optionsEditor}>
                    {form.options.map((opt, idx) => (
                      <div key={idx} className={styles.optionRow}>
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const o = [...form.options];
                            o[idx] = e.target.value;
                            setForm((p) => ({ ...p, options: o }));
                          }}
                          disabled={submitting}
                        />
                        <button
                          type="button"
                          className={styles.removeOptionBtn}
                          onClick={() => removeOption(idx)}
                          disabled={submitting}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <div className={styles.optionRow}>
                      <input
                        type="text"
                        placeholder="Ajouter..."
                        value={newOption}
                        onChange={(e) => setNewOption(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addOption();
                          }
                        }}
                        disabled={submitting}
                      />
                      <button
                        type="button"
                        className={styles.addOptionBtn}
                        onClick={addOption}
                        disabled={submitting || !newOption.trim()}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className={styles.saveBtn}
                  disabled={submitting || !form.label.trim()}
                >
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
            <p>
              Voulez-vous supprimer <strong>{deleteTarget.label}</strong> ?
            </p>
            <div className={styles.confirmActions}>
              <button className={styles.cancelBtn} onClick={() => setDeleteTarget(null)}>
                Annuler
              </button>
              <button className={styles.confirmDeleteBtn} onClick={handleDelete}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
