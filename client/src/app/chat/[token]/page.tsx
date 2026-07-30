"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import styles from "./chat.module.css";

interface ChatMessage {
  role: "user" | "bot";
  content: string;
  options?: string[] | null;
  inputDisabled?: boolean;
}

interface ScenarioBlock {
  _id?: string;
  name: string;
  currentField: number;
  answers: Record<string, any>;
}

export default function ChatbotPage() {
  const params = useParams();
  const token = params.token as string;

  // Core state
  const [phase, setPhase] = useState<"loading" | "info" | "review" | "scenario" | "completed">("loading");
  const [error, setError] = useState("");

  // Info phase
  const [infoMessages, setInfoMessages] = useState<ChatMessage[]>([]);
  const [infoInput, setInfoInput] = useState("");
  const [infoSending, setInfoSending] = useState(false);
  const [infoStep, setInfoStep] = useState(0);
  const [totalInfoFields, setTotalInfoFields] = useState(0);
  const [currentFieldLabel, setCurrentFieldLabel] = useState<string | null>(null);
  const [infoInputDisabled, setInfoInputDisabled] = useState(false);

  // Review phase
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Scenario phase
  const [scenarios, setScenarios] = useState<ScenarioBlock[]>([]);
  const [activeScenario, setActiveScenario] = useState<number | null>(null);
  const [scenarioMessages, setScenarioMessages] = useState<Record<number, ChatMessage[]>>({});
  const [scenarioInput, setScenarioInput] = useState("");
  const [scenarioSending, setScenarioSending] = useState(false);
  const [scenarioStep, setScenarioStep] = useState<Record<number, number>>({});
  const [totalScenarioFields, setTotalScenarioFields] = useState(0);
  const [scenarioFieldLabel, setScenarioFieldLabel] = useState<string | null>(null);
  const [scenarioInputDisabled, setScenarioInputDisabled] = useState(false);
  const [scenarioDone, setScenarioDone] = useState<Record<number, boolean>>({});
  const [newScenarioName, setNewScenarioName] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [infoMessages]);
  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [scenarioMessages]);

  // ─── Init ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) return;
    initProject();
  }, [token]);

  const initProject = async () => {
    try {
      const projectRes = await fetch(`/api/public/projects/${token}`);
      if (!projectRes.ok) { setError("Projet introuvable ou lien invalide."); setPhase("completed"); return; }
      const projectData = await projectRes.json();

      if (projectData.phase === "completed") {
        setPhase("completed");
        return;
      }

      if (projectData.phase === "review") {
        setPhase("review");
        setAnswers(projectData.answers || {});
        return;
      }

      if (projectData.phase === "scenario") {
        setPhase("scenario");
        setAnswers(projectData.answers || {});
        setScenarios(projectData.scenarios || []);
        if ((projectData.scenarios || []).length > 0) setActiveScenario(0);
        return;
      }

      setPhase(projectData.phase || "info");
      setInfoStep(projectData.currentStep || 0);
      if (projectData.phase === "info") await initChat();
    } catch {
      setError("Erreur de connexion au serveur.");
      setPhase("completed");
    }
  };

  // ─── Info Chat ────────────────────────────────────────────────

  const initChat = async () => {
    try {
      const res = await fetch(`/api/public/chat/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: "__init__" }),
      });
      const data = await res.json();
      setInfoMessages([{ role: "bot", content: data.botMessage, options: data.options, inputDisabled: data.inputDisabled }]);
      setInfoInputDisabled(data.inputDisabled ?? false);
      if (data.totalFields) setTotalInfoFields(data.totalFields);
      if (data.currentFieldLabel) setCurrentFieldLabel(data.currentFieldLabel);
      if (data.nextStep !== undefined) setInfoStep(data.nextStep);
    } catch {
      setError("Erreur de connexion.");
    }
  };

  const sendInfoMessage = async (text: string) => {
    if (!text.trim() || infoSending) return;

    const displayContent = text === "__help__" ? "J'ai besoin d'aide pour cette étape." : text;
    setInfoMessages((prev) => [...prev, { role: "user", content: displayContent }]);
    setInfoInput("");
    setInfoSending(true);
    setInfoInputDisabled(false);

    try {
      const res = await fetch(`/api/public/chat/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: text }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message); }
      const data = await res.json();

      if (data.phase === "review") {
        setPhase("review");
        setAnswers(data.answers || {});
        return;
      }

      setInfoMessages((prev) => [...prev, { role: "bot", content: data.botMessage, options: data.options, inputDisabled: data.inputDisabled }]);
      setInfoInputDisabled(data.inputDisabled ?? false);
      if (data.nextStep !== undefined) setInfoStep(data.nextStep);
      if (data.totalFields) setTotalInfoFields(data.totalFields);
      if (data.currentFieldLabel !== undefined) setCurrentFieldLabel(data.currentFieldLabel);
    } catch (err: any) {
      setInfoMessages((prev) => [...prev, { role: "bot", content: err.message || "Erreur. Réessayez." }]);
    } finally {
      setInfoSending(false);
    }
  };

  // ─── Review ─────────────────────────────────────────────────

  const startEdit = (key: string, val: any) => {
    setEditingKey(key);
    setEditValue(Array.isArray(val) ? val.join(", ") : String(val));
  };

  const saveEdit = () => {
    if (!editingKey) return;
    const updated = { ...answers, [editingKey]: editValue };
    setAnswers(updated);
    setEditingKey(null);
  };

  const confirmReview = async () => {
    const res = await fetch(`/api/public/chat/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userMessage: "__confirm__" }),
    });
    if (!res.ok) { setError("Erreur lors de la confirmation."); return; }
    const data = await res.json();
    setPhase("scenario");
    setAnswers(data.answers || {});
    setScenarios(data.scenarios || []);
    setActiveScenario(0);
  };

  // ─── Scenario ───────────────────────────────────────────────

  const initScenarioChat = async (sIdx: number) => {
    if (scenarioMessages[sIdx] && scenarioMessages[sIdx].length > 0) return;
    try {
      const res = await fetch(`/api/public/chat/${token}/scenario/${sIdx}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: "__init__" }),
      });
      const data = await res.json();
      setScenarioMessages((prev) => ({ ...prev, [sIdx]: [{ role: "bot", content: data.botMessage, options: data.options, inputDisabled: data.inputDisabled }] }));
      setScenarioStep((prev) => ({ ...prev, [sIdx]: data.nextStep }));
      setTotalScenarioFields(data.totalFields);
      setScenarioFieldLabel(data.currentFieldLabel);
      setScenarioInputDisabled(data.inputDisabled ?? false);
    } catch {
      setScenarioMessages((prev) => ({ ...prev, [sIdx]: [{ role: "bot", content: "Erreur de connexion." }] }));
    }
  };

  const sendScenarioMessage = async (text: string) => {
    if (!text.trim() || scenarioSending || activeScenario === null) return;

    const displayContent = text === "__help__" ? "J'ai besoin d'aide pour cette étape." : text;
    const msgs = scenarioMessages[activeScenario] || [];
    setScenarioMessages((prev) => ({ ...prev, [activeScenario]: [...msgs, { role: "user", content: displayContent }] }));
    setScenarioInput("");
    setScenarioSending(true);
    setScenarioInputDisabled(false);

    try {
      const res = await fetch(`/api/public/chat/${token}/scenario/${activeScenario}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: text }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message); }
      const data = await res.json();

      const updatedMsgs = scenarioMessages[activeScenario] || [];
      setScenarioMessages((prev) => ({ ...prev, [activeScenario]: [...updatedMsgs, { role: "bot", content: data.botMessage, options: data.options, inputDisabled: data.inputDisabled }] }));
      setScenarioInputDisabled(data.inputDisabled ?? false);
      if (data.nextStep !== undefined) setScenarioStep((prev) => ({ ...prev, [activeScenario]: data.nextStep }));
      if (data.totalFields) setTotalScenarioFields(data.totalFields);
      if (data.currentFieldLabel !== undefined) setScenarioFieldLabel(data.currentFieldLabel);
      if (data.done) setScenarioDone((prev) => ({ ...prev, [activeScenario]: true }));
    } catch (err: any) {
      const updatedMsgs = scenarioMessages[activeScenario] || [];
      setScenarioMessages((prev) => ({ ...prev, [activeScenario]: [...updatedMsgs, { role: "bot", content: err.message || "Erreur. Réessayez." }] }));
    } finally {
      setScenarioSending(false);
    }
  };

  const addScenario = async () => {
    const res = await fetch(`/api/public/chat/${token}/scenario/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newScenarioName || undefined }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setScenarios(data.scenarios);
    setNewScenarioName("");
    const newIdx = data.scenarios.length - 1;
    setActiveScenario(newIdx);
    setScenarioMessages((prev) => ({ ...prev, [newIdx]: [] }));
  };

  const deleteScenario = async (sIdx: number) => {
    const res = await fetch(`/api/public/chat/${token}/scenario/delete/${sIdx}`, {
      method: "POST",
    });
    if (!res.ok) return;
    const data = await res.json();
    setScenarios(data.scenarios);
    if (activeScenario === sIdx) setActiveScenario(data.scenarios.length > 0 ? 0 : null);
    else if (activeScenario !== null && activeScenario > sIdx) setActiveScenario(activeScenario - 1);
  };

  const finishProject = async () => {
    await fetch(`/api/public/chat/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userMessage: "__scenario_done__" }),
    });
    setPhase("completed");
  };

  // ─── Render Helpers ──────────────────────────────────────────

  const renderMarkdown = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return part.split("\n").map((line, j) => (<span key={`${i}-${j}`}>{line}{j < part.split("\n").length - 1 && <br />}</span>));
    });
  };

  const renderChat = (
    messages: ChatMessage[],
    input: string,
    setInput: (v: string) => void,
    send: (v: string) => void,
    sending: boolean,
    inputDisabled: boolean,
    label: string | null,
    step: number,
    total: number,
  ) => {
    const progressPct = total > 0 ? Math.min(((step + 1) / (total + 1)) * 100, 100) : 0;
    return (
      <>
        <header className={styles.chatHeader}>
          <div className={styles.headerLeft}>
            <span className={styles.headerLogo}>🎓</span>
            <div>
              <div className={styles.headerTitle}>Tadreex Creator</div>
              <div className={styles.headerSubtitle}>Assistant de conception VR</div>
            </div>
          </div>
          <div className={styles.headerRight}>
            <span className={styles.stepLabel}>{label ? `${step + 1}/${total + 1} — ${label}` : ""}</span>
            <div className={styles.progressBar}><div className={styles.progressFill} style={{ width: `${progressPct}%` }} /></div>
          </div>
        </header>

        <main className={styles.messageList}>
          {messages.map((msg, idx) => (
            <div key={idx} className={`${styles.messageRow} ${msg.role === "user" ? styles.userRow : styles.botRow}`}>
              {msg.role === "bot" && <div className={styles.avatar}>🤖</div>}
              <div className={`${styles.bubble} ${msg.role === "user" ? styles.userBubble : styles.botBubble}`}>
                <div className={styles.bubbleText}>{renderMarkdown(msg.content)}</div>
                {msg.role === "bot" && msg.options && idx === messages.length - 1 && (
                  <div className={styles.optionButtons}>
                    {msg.options.map((opt) => (
                      <button key={opt} className={styles.optionBtn} onClick={() => send(opt)} disabled={sending}>{opt}</button>
                    ))}
                  </div>
                )}
              </div>
              {msg.role === "user" && <div className={styles.userAvatar}>👤</div>}
            </div>
          ))}
          {sending && (
            <div className={`${styles.messageRow} ${styles.botRow}`}>
              <div className={styles.avatar}>🤖</div>
              <div className={`${styles.bubble} ${styles.botBubble} ${styles.typingBubble}`}>
                <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
              </div>
            </div>
          )}
          <div ref={chatBottomRef} />
        </main>

        <footer className={styles.inputBar}>
          <button className={styles.helpBtn} onClick={() => send("__help__")} disabled={sending}>Aide</button>
          <textarea className={styles.textInput} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} placeholder={inputDisabled ? "Choisissez ci-dessus..." : "Votre réponse... (Entrée)"} disabled={inputDisabled} rows={1} />
          <button className={styles.sendBtn} onClick={() => send(input)} disabled={!input.trim() || sending || inputDisabled}>➤</button>
        </footer>
      </>
    );
  };

  // ─── Completed ──────────────────────────────────────────────

  if (phase === "completed") {
    return (
      <div className={styles.fullPage}>
        <div className={styles.completedBox}>
          <span className={styles.completedIcon}>✓</span>
          <h2>Projet terminé !</h2>
          <p>Merci d&apos;avoir utilisé Tadreex Creator. Les informations sont enregistrées.</p>
          {error && <p className={styles.errorText}>{error}</p>}
        </div>
      </div>
    );
  }

  // ─── Review ─────────────────────────────────────────────────

  if (phase === "review") {
    return (
      <div className={styles.chatPage}>
        <header className={styles.chatHeader}>
          <div className={styles.headerLeft}>
            <span className={styles.headerLogo}>🎓</span>
            <div>
              <div className={styles.headerTitle}>Tadreex Creator</div>
              <div className={styles.headerSubtitle}>Récapitulatif des informations</div>
            </div>
          </div>
          <div className={styles.headerRight}>
            <span className={styles.stepLabel}>Phase info — terminée</span>
            <div className={styles.progressBar}><div className={styles.progressFill} style={{ width: "100%" }} /></div>
          </div>
        </header>

        <main className={styles.reviewMain}>
          <h3 className={styles.reviewTitle}>Vérifiez vos réponses</h3>
          <p className={styles.reviewDesc}>Modifiez si nécessaire, puis confirmez.</p>

          <table className={styles.reviewTable}>
            <thead>
              <tr><th>Champ</th><th>Réponse</th><th></th></tr>
            </thead>
            <tbody>
              {Object.entries(answers).map(([key, val]) => (
                <tr key={key}>
                  <td className={styles.reviewLabel}>{key}</td>
                  <td className={styles.reviewValue}>
                    {editingKey === key ? (
                      <input className={styles.reviewInput} value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); }} autoFocus />
                    ) : (
                      Array.isArray(val) ? val.join(", ") : String(val)
                    )}
                  </td>
                  <td className={styles.reviewAction}>
                    {editingKey === key ? (
                      <button className={styles.reviewSaveBtn} onClick={saveEdit}>✓</button>
                    ) : (
                      <button className={styles.reviewEditBtn} onClick={() => startEdit(key, val)}>✎</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button className={styles.confirmBtn} onClick={confirmReview}>
            Confirmer & Continuer →
          </button>
        </main>
      </div>
    );
  }

  // ─── Scenario ───────────────────────────────────────────────

  if (phase === "scenario") {
    const activeMsgs = activeScenario !== null ? scenarioMessages[activeScenario] || [] : [];
    const activeStep = activeScenario !== null ? scenarioStep[activeScenario] || 0 : 0;
    const activeDone = activeScenario !== null ? scenarioDone[activeScenario] || false : false;
    const allDone = scenarios.length > 0 && scenarios.every((_, i) => scenarioDone[i]);

    return (
      <div className={styles.chatPage}>
        <header className={styles.chatHeader}>
          <div className={styles.headerLeft}>
            <span className={styles.headerLogo}>🎓</span>
            <div>
              <div className={styles.headerTitle}>Tadreex Creator</div>
              <div className={styles.headerSubtitle}>Construction des scénarios</div>
            </div>
          </div>
          <div className={styles.headerRight}>
            <span className={styles.stepLabel}>{scenarios.length} scénario(s)</span>
          </div>
        </header>

        <div className={styles.scenarioLayout}>
          <aside className={styles.scenarioSidebar}>
            <div className={styles.scenarioList}>
              {scenarios.map((sc, i) => (
                <button key={i} className={`${styles.scenarioTab} ${activeScenario === i ? styles.scenarioTabActive : ""} ${scenarioDone[i] ? styles.scenarioTabDone : ""}`} onClick={() => { setActiveScenario(i); if (!scenarioMessages[i] || scenarioMessages[i].length === 0) initScenarioChat(i); }}>
                  <span>{sc.name}</span>
                  {scenarioDone[i] && <span className={styles.scenarioCheck}>✓</span>}
                </button>
              ))}
            </div>

            <div className={styles.scenarioAdd}>
              <input className={styles.scenarioNameInput} value={newScenarioName} onChange={(e) => setNewScenarioName(e.target.value)} placeholder="Nouveau scénario..." />
              <button className={styles.scenarioAddBtn} onClick={addScenario} disabled={!newScenarioName.trim()}>+</button>
            </div>

            {scenarios.length > 0 && (
              <div className={styles.scenarioActions}>
                {allDone && <button className={styles.finishBtn} onClick={finishProject}>Terminer le projet</button>}
              </div>
            )}
          </aside>

          <div className={styles.scenarioChatArea}>
            {activeScenario === null ? (
              <div className={styles.selectPrompt}>Sélectionnez ou ajoutez un scénario</div>
            ) : (
              <>
                <div className={styles.scenarioChatHeader}>
                  <span className={styles.scenarioNameTag}>{scenarios[activeScenario]?.name}</span>
                  {scenarios.length > 1 && (
                    <button className={styles.scenarioDeleteBtn} onClick={() => deleteScenario(activeScenario)}>Supprimer</button>
                  )}
                </div>
                {activeMsgs.length === 0 && !activeDone ? (
                  <div className={styles.selectPrompt}>
                    <button className={styles.startScenarioBtn} onClick={() => initScenarioChat(activeScenario)}>Commencer ce scénario</button>
                  </div>
                ) : (
                  renderChat(activeMsgs, scenarioInput, setScenarioInput, sendScenarioMessage, scenarioSending, scenarioInputDisabled, scenarioFieldLabel, activeStep, totalScenarioFields)
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Info ───────────────────────────────────────────────────

  return (
    <div className={styles.chatPage}>
      {renderChat(infoMessages, infoInput, setInfoInput, sendInfoMessage, infoSending, infoInputDisabled, currentFieldLabel, infoStep, totalInfoFields)}
    </div>
  );
}
