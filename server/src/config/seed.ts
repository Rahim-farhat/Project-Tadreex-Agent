import { query } from './db';

// Default scenario step fields, tagged with the lowest mode that asks them.
// Keys match the step keys the admin project page and the legacy chat already use.
const DEFAULT_SCENARIO_FIELDS = [
  {
    key: 'titre',
    label: "l'intitulé de l'étape",
    description: 'Nom court et explicite de l\'étape décrivant la tâche.',
    forbidden: '',
    level: 'beginner',
  },
  {
    key: 'acteur',
    label: "qui fait quoi (l'acteur de l'étape)",
    description: "La personne ou le rôle qui réalise l'étape (ex: technicien, infirmier, chef d'équipe).",
    forbidden: '',
    level: 'beginner',
  },
  {
    key: 'action',
    label: "l'action gestuelle du participant",
    description: 'Ce que le participant fait physiquement avec ses mains/manettes dans la VR.',
    forbidden: "L'interface (UI), les animations, les règles de validation.",
    level: 'beginner',
  },
  {
    key: 'resultat',
    label: "le résultat / les interactions dans la simulation",
    description:
      "Ce que la simulation VR produit en réaction à l'action (comportement des objets 3D, snap, feedback physique).",
    forbidden: "Les gestes du participant.",
    level: 'intermediate',
  },
  {
    key: 'objets3d',
    label: 'les objets / assets 3D nécessaires',
    description: 'Liste des objets, outils, pièces et assets 3D modélisés pour cette étape.',
    forbidden: '',
    level: 'intermediate',
  },
  {
    key: 'ui',
    label: "l'interface utilisateur (UI)",
    description:
      "Éléments visuels d'interface 2D/3D affichés à l'écran (overlays, jauges, compteurs, tooltips, messages, boutons).",
    forbidden: "Les gestes physiques ou consignes d'atelier.",
    level: 'expert',
  },
  {
    key: 'animations',
    label: 'les animations / effets visuels (VFX) et sons',
    description: 'Animations des objets, effets visuels (particules, surbrillance) et effets sonores.',
    forbidden: '',
    level: 'expert',
  },
  {
    key: 'validation',
    label: 'la règle de validation et le feedback',
    description: "Condition technique qui valide l'étape et feedback renvoyé en cas de succès ou d'erreur.",
    forbidden: '',
    level: 'expert',
  },
];

// Lowest mode that asks each of the standard keys; used to tag pre-existing fields once.
const KEY_LEVELS: Record<string, string> = Object.fromEntries(DEFAULT_SCENARIO_FIELDS.map((f) => [f.key, f.level]));

// Runs at API start. Fills an empty table, or (once, guarded by settings.levels_initialized)
// tags the standard keys of an existing table and adds the "who does what" field.
// After that run admin edits are never touched.
export const seedScenarioFields = async (): Promise<void> => {
  await query(`INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  const [{ done }] = await query<{ done: boolean }>(`SELECT levels_initialized AS done FROM settings WHERE id = 1`);
  if (done) return;

  const [{ count }] = await query<{ count: string }>(`SELECT COUNT(*) AS count FROM scenario_fields`);
  if (parseInt(count, 10) === 0) {
    for (const [i, f] of DEFAULT_SCENARIO_FIELDS.entries()) {
      await query(
        `INSERT INTO scenario_fields (key, label, description, forbidden, level, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [f.key, f.label, f.description, f.forbidden, f.level, i],
      );
    }
    console.log('🌱 Seeded default scenario fields');
  } else {
    for (const [key, level] of Object.entries(KEY_LEVELS)) {
      await query(`UPDATE scenario_fields SET level = $2 WHERE LOWER(key) = $1`, [key, level]);
    }
    const [{ n }] = await query<{ n: string }>(`SELECT COUNT(*) AS n FROM scenario_fields WHERE LOWER(key) = 'acteur'`);
    if (parseInt(n, 10) === 0) {
      const f = DEFAULT_SCENARIO_FIELDS.find((d) => d.key === 'acteur')!;
      await query(
        `INSERT INTO scenario_fields (key, label, description, forbidden, level, sort_order)
         VALUES ($1, $2, $3, $4, $5, COALESCE((SELECT MIN(sort_order) FROM scenario_fields WHERE LOWER(key) = 'titre'), 0))`,
        [f.key, f.label, f.description, f.forbidden, f.level],
      );
    }
    console.log('🏷️  Tagged existing scenario fields with mode levels');
  }
  await query(`UPDATE settings SET levels_initialized = true WHERE id = 1`);
};
