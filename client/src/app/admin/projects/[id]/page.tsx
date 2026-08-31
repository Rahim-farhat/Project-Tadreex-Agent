'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import styles from './project-detail.module.css';

interface Etape {
  description?: string;
  suggestions?: string;
  ajustements?: string;
}

interface Scene {
  nom?: string;
  etapes: Etape[];
}

interface StepRow {
  numero?: string;
  titre?: string;
  action?: string;
  resultat?: string;
  objets3d?: string;
  ui?: string;
  animations?: string;
  validation?: string;
  statut?: string;
}

interface ScenarioBlock {
  name: string;
  answers: Record<string, any>;
  builder?: { state?: string };
}

interface Project {
  _id: string;
  title: string;
  status: string;
  clientToken: string;
  currentStep: number;
  answers: Record<string, any>;
  scenarios: ScenarioBlock[];
}

const EMPTY = <span className={styles.emptyValue}>—</span>;

const SCENARIO_COLUMNS: Array<{ key: keyof StepRow; label: string }> = [
  { key: "numero", label: "N°" },
  { key: "titre", label: "Titre de l'étape" },
  { key: "action", label: "Action gestuelle" },
  { key: "resultat", label: "Résultat / Interaction" },
  { key: "objets3d", label: "Objets 3D" },
  { key: "ui", label: "Interface (UI)" },
  { key: "animations", label: "Animations / VFX" },
  { key: "validation", label: "Validation" },
  { key: "statut", label: "Statut" },
];

function StepTable({ steps }: { steps: StepRow[] }) {
  return (
    <div className={styles.stepTableWrap}>
      <table className={styles.stepTable}>
        <thead>
          <tr>
            {SCENARIO_COLUMNS.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {steps.length === 0 ? (
            <tr>
              <td colSpan={SCENARIO_COLUMNS.length} className={styles.muted}>
                Aucune étape définie.
              </td>
            </tr>
          ) : (
            steps.map((step, i) => (
              <tr key={i}>
                {SCENARIO_COLUMNS.map((c) => (
                  <td key={c.key}>
                    {step[c.key] ? String(step[c.key]) : EMPTY}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function PreviewPanel({ answers, scenarios }: { answers: Record<string, any>; scenarios: ScenarioBlock[] }) {
  const scenes = (answers.scenes || []) as Scene[];
  const fieldKeys = Object.keys(answers).filter((k) => k !== 'scenes');

  return (
    <div className={styles.previewContainer}>
      <div className={styles.card}>
        <h2>Informations générales</h2>
        {fieldKeys.length === 0 ? (
          <p className={styles.muted}>Aucune réponse collectée pour l&apos;instant.</p>
        ) : (
          <dl className={styles.defList}>
            {fieldKeys.map((key) => (
              <div key={key} className={styles.defRow}>
                <dt>{key}</dt>
                <dd>
                  {Array.isArray(answers[key])
                    ? (answers[key] as string[]).join(', ')
                    : answers[key]
                      ? String(answers[key])
                      : EMPTY}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className={styles.card}>
        <h2>
          Scénario ({scenes.length} scène{scenes.length !== 1 ? 's' : ''})
        </h2>

        {scenes.length === 0 ? (
          <p className={styles.muted}>Aucune scène définie pour l&apos;instant.</p>
        ) : (
          scenes.map((scene, si) => (
            <div key={si} className={styles.sceneBlock}>
              <h3 className={styles.sceneTitle}>
                <span className={styles.sceneNum}>{si + 1}</span>
                {scene.nom || <em className={styles.muted}>Scène sans nom</em>}
              </h3>

              {!scene.etapes || scene.etapes.length === 0 ? (
                <p className={styles.muted}>Aucune étape dans cette scène.</p>
              ) : (
                <table className={styles.etapeTable}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Description</th>
                      <th>Suggestions</th>
                      <th>Ajustements IA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scene.etapes.map((etape, ei) => (
                      <tr key={ei}>
                        <td className={styles.etapeNum}>{ei + 1}</td>
                        <td>{etape.description || EMPTY}</td>
                        <td>{etape.suggestions || EMPTY}</td>
                        <td>{etape.ajustements || EMPTY}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))
        )}
      </div>

      {scenarios.length > 0 && (
        <div className={styles.card}>
          <h2>Scénarios ({scenarios.length})</h2>
          {scenarios.map((sc, si) => {
            const steps = Array.isArray(sc.answers?.steps)
              ? (sc.answers.steps as StepRow[])
              : null;
            const sKeys = steps ? [] : Object.keys(sc.answers || {});
            const isDone = sc.builder?.state === 'done';
            return (
              <div key={si} className={styles.sceneBlock}>
                <h3 className={styles.sceneTitle}>
                  <span className={styles.sceneNum}>{si + 1}</span>
                  {sc.name}
                  <span
                    className={`${styles.scenarioStatus} ${isDone ? styles.scenarioStatusDone : ''}`}
                  >
                    {isDone ? 'Terminé' : 'En cours'}
                  </span>
                </h3>
                {steps !== null ? (
                  <StepTable steps={steps} />
                ) : sKeys.length === 0 ? (
                  <p className={styles.muted}>Aucune réponse.</p>
                ) : (
                  <dl className={styles.defList}>
                    {sKeys.map((k) => (
                      <div key={k} className={styles.defRow}>
                        <dt>{k}</dt>
                        <dd>{Array.isArray(sc.answers[k]) ? sc.answers[k].join(', ') : String(sc.answers[k])}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'edit'>('preview');
  const router = useRouter();

  const [status, setStatus] = useState('');
  const [answers, setAnswers] = useState<Record<string, any>>({ scenes: [] });

  useEffect(() => {
    if (!id) return;
    const fetchProject = async () => {
      try {
        const res = await fetch(`/api/admin/projects/${id}`);
        if (res.ok) {
          const data = await res.json();
          setProject(data);
          setStatus(data.status);
          setAnswers(data.answers || { scenes: [] });
        } else {
          router.push('/admin/projects');
        }
      } catch (error) {
        console.error('Error fetching project:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [id, router]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/projects/${id}/answers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, answers }),
      });
      if (res.ok) alert('Project saved successfully!');
    } catch (error) {
      console.error('Error saving project:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleFieldChange = (key: string, value: string) =>
    setAnswers((prev) => ({ ...prev, [key]: value }));

  if (loading) return <div className={styles.loading}>Loading project…</div>;
  if (!project) return <div className={styles.loading}>Project not found.</div>;

  const fieldKeys = Object.keys(answers).filter((k) => k !== 'scenes');

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <Link href="/admin/projects" className={styles.backLink}>
            ← Back to Projects
          </Link>
          <h1 className={styles.title}>{project.title}</h1>
          <p className={styles.tokenText}>
            Client link: <code>/chat/{project.clientToken}</code>
          </p>
        </div>
        <div className={styles.actions}>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={styles.statusSelect}
          >
            <option value="draft">Draft</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
          <button onClick={handleSave} className={styles.saveBtn} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'preview' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('preview')}
        >
          Preview
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'edit' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('edit')}
        >
          Edit
        </button>
      </div>

      {activeTab === 'preview' && <PreviewPanel answers={answers} scenarios={project?.scenarios || []} />}

      {activeTab === 'edit' && (
        <div className={styles.content}>
          <div className={styles.card}>
            <h2>Field Answers</h2>
            {fieldKeys.length === 0 ? (
              <p className={styles.muted}>No answers collected yet.</p>
            ) : (
              <div className={styles.formGrid}>
                {fieldKeys.map((key) => (
                  <div key={key} className={`${styles.formGroup} ${styles.fullWidth}`}>
                    <label>{key}</label>
                    <input
                      type="text"
                      value={answers[key] || ''}
                      onChange={(e) => handleFieldChange(key, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.card}>
            <h2>Scenes &amp; Etapes</h2>
            <p className={styles.muted}>
              Scene editing is done via the client form at{' '}
              <code>/chat/{project.clientToken}</code>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
