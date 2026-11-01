"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import styles from "./modeflow.module.css";

type Mode = "beginner" | "intermediate" | "expert";
type FlowPhase = "brainstorm" | "refine" | "final";

interface Missing {
  scenarioIndex: number;
  stepIndex: number;
  key: string;
  label: string;
  scenarioName: string;
  stepTitle: string;
}

interface FlowState {
  phase: FlowPhase;
  scenarios: { name: string; answers?: { steps?: Record<string, any>[] } }[];
  fields: { key: string; label: string }[];
  missing: Missing[];
  brainstormText: string;
}

interface ChatMsg {
  role: "user" | "bot";
  content: string;
}

interface Props {
  token: string;
  mode: Mode;
  initialPhase: FlowPhase;
  onCompleted: () => void;
  // Returns true when the response was a rate-limit error and the modal was shown
  onRateLimit: (res: Response, data: any, prefix?: string) => boolean;
  onNotice: (msg: string) => void;
}

const GUIDES: Record<Mode, { intro: string; points: string[] }> = {
  beginner: {
    intro: "Racontez simplement votre formation, comme si vous l'expliquiez à un collègue.",
    points: [
      "Décrivez le 1er scénario : son nom et ses étapes, dans l'ordre.",
      "Pour chaque étape, dites qui fait quoi.",
      "Passez ensuite au scénario suivant, s'il y en a un.",
    ],
  },
  intermediate: {
    intro: "Décrivez vos scénarios et ce qui se passe à chaque étape.",
    points: [
      "Décrivez le 1er scénario : son nom et ses étapes, dans l'ordre.",
      "Pour chaque étape : qui fait quoi.",
      "Ce que la simulation fait en réaction (interactions).",
      "Les objets 3D nécessaires (outils, pièces, équipements).",
      "Passez ensuite au scénario suivant.",
    ],
  },
  expert: {
    intro: "Donnez le maximum de détails : plus vous en dites, moins nous aurons de questions.",
    points: [
      "Décrivez le 1er scénario : son nom et ses étapes, dans l'ordre.",
      "Pour chaque étape : qui fait quoi et les interactions.",
      "Les objets 3D nécessaires.",
      "L'interface affichée (messages, jauges, boutons).",
      "Les animations, effets visuels et sons.",
      "La règle de validation et le feedback.",
      "Passez ensuite au scénario suivant.",
    ],
  },
};

const STEPS: { id: FlowPhase; label: string }[] = [
  { id: "brainstorm", label: "Brainstorming" },
  { id: "refine", label: "Affinage" },
  { id: "final", label: "Résultat final" },
];

const QUICK = ["Ajouter une étape", "Ajouter un scénario", "Supprimer une étape", "Renommer un scénario"];

export default function ModeFlow({ token, mode, initialPhase, onCompleted, onRateLimit, onNotice }: Props) {
  const [state, setState] = useState<FlowState | null>(null);
  const [phase, setPhase] = useState<FlowPhase>(initialPhase);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  // Fix-problems popups
  const [fixQueue, setFixQueue] = useState<Missing[] | null>(null);
  const [fixPos, setFixPos] = useState(-1); // -1 = intro popup
  const [fixValue, setFixValue] = useState("");
  const [fixError, setFixError] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);

  // Side chat
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const base = `/api/public/chat/${token}`;

  useEffect(() => {
    const el = chatEndRef.current?.parentElement;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chat, busy]);

  const call = async (path: string, method: "GET" | "POST", body?: unknown, prefix = "Erreur") => {
    try {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && onRateLimit(res, data, prefix)) return { ok: false, data, rateLimited: true };
      return { ok: res.ok, data, rateLimited: false };
    } catch {
      onNotice("Erreur de connexion. Réessayez.");
      return { ok: false, data: {}, rateLimited: true };
    }
  };

  const apply = (data: any) => {
    setState(data);
    if (data.phase === "brainstorm" || data.phase === "refine" || data.phase === "final") setPhase(data.phase);
  };

  useEffect(() => {
    (async () => {
      const { ok, data } = await call("/mode", "GET");
      if (ok) {
        apply(data);
        setText(data.brainstormText || "");
      }
    })();
  }, [token]);

  // ── Step 1 ────────────────────────────────────────────────────
  const submitBrainstorm = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const { ok, data, rateLimited } = await call("/brainstorm", "POST", { text }, "Brainstorm error");
    setBusy(false);
    if (ok) {
      apply(data);
      setChat([]);
    } else if (!rateLimited) {
      onNotice(data.message || "Erreur lors de l'analyse. Réessayez.");
    }
  };

  const backToBrainstorm = async () => {
    if (!window.confirm("Revenir au texte ? Une nouvelle analyse remplacera les corrections faites.")) return;
    const { ok, data } = await call("/brainstorm/back", "POST", {});
    if (ok) apply(data);
  };

  // ── Step 2: fix problems ──────────────────────────────────────
  const missing = state?.missing ?? [];

  const startFix = () => {
    if (missing.length === 0) return;
    setFixQueue(missing);
    setFixPos(-1);
  };

  const loadSuggestions = async (m: Missing) => {
    setSuggestions([]);
    setLoadingSuggest(true);
    const { ok, data } = await call(
      "/refine/suggest",
      "POST",
      { scenarioIndex: m.scenarioIndex, stepIndex: m.stepIndex, key: m.key },
      "Suggest error",
    );
    setLoadingSuggest(false);
    if (ok) setSuggestions(data.suggestions || []);
  };

  const gotoFix = (pos: number) => {
    setFixPos(pos);
    setFixValue("");
    setFixError("");
    if (fixQueue && fixQueue[pos]) loadSuggestions(fixQueue[pos]);
  };

  const closeFix = () => {
    setFixQueue(null);
    setFixPos(-1);
  };

  const submitFix = async () => {
    if (!fixQueue || !fixValue.trim() || busy) return;
    const m = fixQueue[fixPos];
    setBusy(true);
    setFixError("");
    const { ok, data, rateLimited } = await call(
      "/refine/fix",
      "POST",
      { scenarioIndex: m.scenarioIndex, stepIndex: m.stepIndex, key: m.key, value: fixValue },
      "Fix error",
    );
    setBusy(false);
    if (ok) {
      apply(data);
      if (fixPos + 1 < fixQueue.length) gotoFix(fixPos + 1);
      else closeFix();
    } else if (!rateLimited) {
      setFixError(data.message || "Réponse non exploitable.");
    }
  };

  // ── Step 2: side chat ─────────────────────────────────────────
  const sendChat = async () => {
    const message = chatInput.trim();
    if (!message || busy) return;
    setChat((c) => [...c, { role: "user", content: message }]);
    setChatInput("");
    setBusy(true);
    const { ok, data, rateLimited } = await call("/refine/chat", "POST", { message }, "Refine chat error");
    setBusy(false);
    if (ok) {
      apply(data);
      setChat((c) => [...c, { role: "bot", content: data.botMessage || "Modifications appliquées." }]);
    } else if (!rateLimited) {
      setChat((c) => [...c, { role: "bot", content: data.message || "Erreur. Réessayez." }]);
    }
  };

  const goFinal = async () => {
    if (missing.length > 0 || busy) return;
    setBusy(true);
    const { ok, data, rateLimited } = await call("/final", "POST", {}, "Final error");
    setBusy(false);
    if (ok) apply(data);
    else if (!rateLimited) onNotice(data.message || "Il reste des informations manquantes.");
  };

  const backToRefine = async () => {
    const { ok, data } = await call("/brainstorm/back", "POST", { to: "refine" });
    if (ok) apply(data);
  };

  // ── Step 3 ────────────────────────────────────────────────────
  const send = async () => {
    if (!window.confirm("Envoyer le résultat ? Vous ne pourrez plus le modifier.")) return;
    setBusy(true);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: "__scenario_done__" }),
      });
      if (res.ok) onCompleted();
      else onNotice("Erreur lors de l'envoi. Réessayez.");
    } catch {
      onNotice("Erreur de connexion. Réessayez.");
    }
    setBusy(false);
  };

  // ── Rendering ─────────────────────────────────────────────────
  const hasMissing = (si: number, sti: number, key: string) =>
    missing.some((m) => m.scenarioIndex === si && m.stepIndex === sti && m.key === key);

  const structure = (showWarnings: boolean) => (
    <div className={styles.structure}>
      {(state?.scenarios ?? []).map((sc, si) => {
        const steps = sc.answers?.steps ?? [];
        return (
          <section key={si} className={styles.scenarioCard}>
            <header className={styles.scenarioHead}>
              <span className={styles.badge}>{si + 1}</span>
              <h3 className={styles.scenarioName}>{sc.name}</h3>
              <span className={styles.count}>
                {steps.length} étape{steps.length > 1 ? "s" : ""}
              </span>
            </header>
            {steps.map((step, sti) => (
              <div key={sti} className={styles.stepCard}>
                <div className={styles.stepTitle}>
                  <span className={styles.stepNum}>{sti + 1}</span>
                  {showWarnings && hasMissing(si, sti, "titre") ? (
                    <span className={styles.warning}>Titre manquant</span>
                  ) : (
                    step.titre || `Étape ${sti + 1}`
                  )}
                </div>
                <dl className={styles.fieldList}>
                  {(state?.fields ?? [])
                    .filter((f) => f.key !== "titre")
                    .map((f) => {
                      const empty = showWarnings && hasMissing(si, sti, f.key);
                      return (
                        <div key={f.key} className={`${styles.fieldRow} ${empty ? styles.fieldMissing : ""}`}>
                          <dt>{f.label}</dt>
                          <dd>
                            {empty ? (
                              <span className={styles.warning}>Information manquante</span>
                            ) : (
                              step[f.key] || <span className={styles.muted}>—</span>
                            )}
                          </dd>
                        </div>
                      );
                    })}
                </dl>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );

  const currentFix = fixQueue && fixPos >= 0 ? fixQueue[fixPos] : null;
  const phaseIndex = STEPS.findIndex((s) => s.id === phase);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <img src="/tadreex.png" alt="Tadreex" className={styles.logo} />
          <div>
            <div className={styles.brandName}>Scenarios Platform</div>
            <div className={styles.brandSub}>Construction de votre scénario</div>
          </div>
        </div>
        <ol className={styles.stepper}>
          {STEPS.map((s, i) => (
            <li
              key={s.id}
              className={`${styles.stepItem} ${i === phaseIndex ? styles.stepActive : ""} ${i < phaseIndex ? styles.stepDone : ""}`}
            >
              <span className={styles.stepDot}>{i < phaseIndex ? <Icon name="check" size={12} /> : i + 1}</span>
              <span className={styles.stepText}>{s.label}</span>
            </li>
          ))}
        </ol>
      </header>

      {phase === "brainstorm" && (
        <main className={styles.brainstorm}>
          <section className={styles.card}>
            <h1 className={styles.title}>Décrivez tout ce que vous avez en tête</h1>
            <p className={styles.lead}>
              Écrivez librement, dans l&apos;ordre que vous voulez. Nous structurerons tout pour vous.
            </p>
            <textarea
              id="brainstorm"
              className={styles.textarea}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
              placeholder="Ex : Scénario 1 « Changement de roue ». Étape 1 : le technicien sécurise le véhicule..."
            />
            <div className={styles.cardFoot}>
              <span className={styles.muted}>{text.length.toLocaleString("fr-FR")} caractères</span>
              <button className={styles.primary} onClick={submitBrainstorm} disabled={busy || !text.trim()}>
                {busy ? (
                  <>
                    <span className={styles.spinner} /> Analyse en cours…
                  </>
                ) : (
                  <>
                    Suivant <Icon name="arrowRight" size={16} />
                  </>
                )}
              </button>
            </div>
          </section>
          <aside className={styles.guide}>
            <div className={styles.guideHead}>
              <Icon name="bulb" size={18} />
              <h2>Comment faire ?</h2>
            </div>
            <p className={styles.lead}>{GUIDES[mode].intro}</p>
            <ol className={styles.guideList}>
              {GUIDES[mode].points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ol>
          </aside>
        </main>
      )}

      {phase === "refine" && state && (
        <main className={styles.refine}>
          <div className={styles.refineMain}>
            {missing.length > 0 ? (
              <div className={styles.alert}>
                <span>
                  <strong>{missing.length}</strong> information{missing.length > 1 ? "s" : ""} manquante
                  {missing.length > 1 ? "s" : ""} à compléter avant de continuer.
                </span>
                <button className={styles.danger} onClick={startFix}>
                  Corriger les problèmes
                </button>
              </div>
            ) : (
              <div className={styles.ok}>
                <Icon name="check" size={16} /> Tout est complet. Ajustez avec l&apos;assistant, ou passez à la suite.
              </div>
            )}
            {structure(true)}
            <div className={styles.actionBar}>
              <button className={styles.secondary} onClick={backToBrainstorm} disabled={busy}>
                <Icon name="arrowLeft" size={16} /> Retour
              </button>
              <button className={styles.primary} onClick={goFinal} disabled={busy || missing.length > 0}>
                Suivant <Icon name="arrowRight" size={16} />
              </button>
            </div>
          </div>

          <aside className={styles.chat}>
            <div className={styles.chatHead}>
              <Icon name="sparkles" size={18} />
              <div>
                <h2>Assistant de modification</h2>
                <p>Modifiez, ajoutez ou supprimez scénarios et étapes.</p>
              </div>
            </div>
            <div className={styles.chatLog}>
              {chat.length === 0 && (
                <div className={styles.chatEmpty}>
                  <p>Dites-moi ce que vous voulez changer, par exemple :</p>
                  <ul>
                    <li>« Ajoute une étape 3 au scénario 1 : le technicien remonte la roue »</li>
                    <li>« Supprime l&apos;étape 2 du scénario 2 »</li>
                    <li>« Ajoute un scénario Contrôle de pression »</li>
                  </ul>
                </div>
              )}
              {chat.map((m, i) => (
                <div key={i} className={m.role === "user" ? styles.msgUser : styles.msgBot}>
                  {m.content}
                </div>
              ))}
              {busy && chat.length > 0 && chat[chat.length - 1].role === "user" && (
                <div className={styles.msgBot}>
                  <span className={styles.dots}>
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className={styles.quick}>
              {QUICK.map((q) => (
                <button
                  key={q}
                  type="button"
                  className={styles.quickChip}
                  onClick={() => setChatInput(q + " ")}
                  disabled={busy}
                >
                  {q}
                </button>
              ))}
            </div>
            <div className={styles.chatInput}>
              <textarea
                rows={3}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendChat();
                  }
                }}
                placeholder="Écrivez votre demande…  (Entrée pour envoyer)"
                disabled={busy}
              />
              <button
                className={styles.sendBtn}
                onClick={sendChat}
                disabled={busy || !chatInput.trim()}
                aria-label="Envoyer"
              >
                <Icon name="send" size={18} />
              </button>
            </div>
          </aside>
        </main>
      )}

      {phase === "final" && state && (
        <main className={styles.final}>
          <h1 className={styles.title}>Résultat final</h1>
          <p className={styles.lead}>Relisez votre scénario. Une fois envoyé, il ne pourra plus être modifié.</p>
          {structure(false)}
          <div className={styles.actionBar}>
            <button className={styles.secondary} onClick={backToRefine} disabled={busy}>
              <Icon name="arrowLeft" size={16} /> Retour
            </button>
            <button className={styles.primary} onClick={send} disabled={busy}>
              Envoyer <Icon name="send" size={16} />
            </button>
          </div>
        </main>
      )}

      {fixQueue && (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            {fixPos === -1 ? (
              <>
                <div className={styles.modalIcon}>
                  <Icon name="sparkles" size={22} />
                </div>
                <h3>Corrigeons ce qui manque</h3>
                <p className={styles.lead}>
                  Il manque <strong>{fixQueue.length}</strong> information{fixQueue.length > 1 ? "s" : ""} dans votre
                  description. Nous allons les compléter ensemble.
                </p>
                <div className={styles.modalActions}>
                  <button className={styles.secondary} onClick={closeFix}>
                    Annuler
                  </button>
                  <button className={styles.primary} onClick={() => gotoFix(0)}>
                    OK
                  </button>
                </div>
              </>
            ) : (
              currentFix && (
                <>
                  <div className={styles.progressBar}>
                    <div style={{ width: `${((fixPos + 1) / fixQueue.length) * 100}%` }} />
                  </div>
                  <div className={styles.progress}>
                    Question {fixPos + 1} sur {fixQueue.length}
                  </div>
                  <h3>
                    {currentFix.scenarioName} · étape {currentFix.stepIndex + 1}
                    {currentFix.stepTitle ? ` (${currentFix.stepTitle})` : ""}
                  </h3>
                  <p className={styles.lead}>
                    Que faut-il indiquer pour : <strong>{currentFix.label}</strong> ?
                  </p>
                  {(loadingSuggest || suggestions.length > 0) && (
                    <div className={styles.chips}>
                      {loadingSuggest && <span className={styles.muted}>Recherche de suggestions…</span>}
                      {suggestions.map((s) => (
                        <button key={s} type="button" className={styles.chip} onClick={() => setFixValue(s)}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    className={styles.fixInput}
                    value={fixValue}
                    onChange={(e) => setFixValue(e.target.value)}
                    placeholder="Votre réponse…"
                    disabled={busy}
                    autoFocus
                  />
                  {fixError && <div className={styles.error}>{fixError}</div>}
                  <div className={styles.modalActions}>
                    <button className={styles.secondary} onClick={closeFix} disabled={busy}>
                      Plus tard
                    </button>
                    <button className={styles.primary} onClick={submitFix} disabled={busy || !fixValue.trim()}>
                      {busy ? "Vérification…" : fixPos + 1 < fixQueue.length ? "Valider et continuer" : "Valider"}
                    </button>
                  </div>
                </>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
