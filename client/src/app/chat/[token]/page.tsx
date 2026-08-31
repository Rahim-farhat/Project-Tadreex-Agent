"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import styles from "./chat.module.css";

interface ChatMessage {
  role: "user" | "bot";
  content: string;
  options?: string[] | null;
  suggestions?: string[] | null;
  inputDisabled?: boolean;
}

function SuggestionPicker({
  suggestions,
  disabled,
  onValidate,
}: {
  suggestions: string[];
  disabled: boolean;
  onValidate: (text: string) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [text, setText] = useState("");

  const toggle = (i: number) => {
    setSelected((prev) => {
      const has = prev.includes(i);
      const next = has ? prev.filter((x) => x !== i) : [...prev, i];
      setText(next.map((x) => suggestions[x]).join("\n"));
      return next;
    });
  };

  const validate = () => {
    const value = text.trim();
    if (!value || disabled) return;
    onValidate(value);
  };

  return (
    <div className={styles.suggestionsContainer}>
      <div className={styles.suggestionsHeader}>
        <span>Suggestions</span>
      </div>
      <div className={styles.suggestionList}>
        {suggestions.map((s, i) => {
          const isSelected = selected.includes(i);
          return (
            <div
              key={i}
              className={`${styles.suggestionCard} ${isSelected ? styles.suggestionCardSelected : ""}`}
              onClick={() => toggle(i)}
            >
              <span className={styles.suggestionCheckbox}>
                {isSelected ? "✓" : ""}
              </span>
              <span className={styles.suggestionText}>{s}</span>
            </div>
          );
        })}
      </div>
      <textarea
        className={styles.textInput}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Sélectionnez ci-dessus ou tapez votre réponse..."
        rows={2}
        disabled={disabled}
      />
      <div className={styles.suggestionActions}>
        <button
          className={styles.suggestionInsertBtn}
          onClick={() => {
            setSelected([]);
            setText("");
          }}
          disabled={disabled}
        >
          Effacer
        </button>
        <button
          className={styles.suggestionValidateBtn}
          onClick={validate}
          disabled={disabled || !text.trim()}
        >
          Valider →
        </button>
      </div>
    </div>
  );
}

interface ScenarioBlock {
  _id?: string;
  name: string;
  currentField: number;
  answers: Record<string, any>;
  builder?: { state?: string };
}

interface ScenarioStep {
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

export default function ChatbotPage() {
  const params = useParams();
  const token = params.token as string;

  // Core state
  const [phase, setPhase] = useState<
    "loading" | "info" | "review" | "scenario" | "completed"
  >("loading");
  const [error, setError] = useState("");

  // Info phase
  const [infoMessages, setInfoMessages] = useState<ChatMessage[]>([]);
  const [infoInput, setInfoInput] = useState("");
  const [infoSending, setInfoSending] = useState(false);
  const [infoStep, setInfoStep] = useState(0);
  const [totalInfoFields, setTotalInfoFields] = useState(0);
  const [currentFieldLabel, setCurrentFieldLabel] = useState<string | null>(
    null,
  );
  const [infoInputDisabled, setInfoInputDisabled] = useState(false);

  // Review phase
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Scenario phase
  const [scenarios, setScenarios] = useState<ScenarioBlock[]>([]);
  const [activeScenario, setActiveScenario] = useState<number | null>(null);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [stepMessages, setStepMessages] = useState<
    Record<number, Record<number, ChatMessage[]>>
  >({});
  const [stepInput, setStepInput] = useState("");
  const [stepSending, setStepSending] = useState(false);
  const [stepComplete, setStepComplete] = useState<
    Record<number, Record<number, boolean>>
  >({});
  const [scenarioDone, setScenarioDone] = useState<Record<number, boolean>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [addName, setAddName] = useState("");
  const [addingScenario, setAddingScenario] = useState(false);
  const [renameTarget, setRenameTarget] = useState<number | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renamingScenario, setRenamingScenario] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [infoMessages]);
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [stepMessages, activeStep]);

  // ─── Init ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) return;
    initProject();
  }, [token]);

  const initProject = async () => {
    try {
      const projectRes = await fetch(`/api/public/projects/${token}`);
      if (!projectRes.ok) {
        setError("Projet introuvable ou lien invalide.");
        setPhase("completed");
        return;
      }
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
        if ((projectData.scenarios || []).length > 0) {
          setActiveScenario(0);
          const firstSteps = projectData.scenarios[0].answers?.steps || [];
          if (firstSteps.length > 0) setActiveStep(0);
        }
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
      setInfoMessages([
        {
          role: "bot",
          content: data.botMessage,
          options: data.options,
          suggestions: data.suggestions,
          inputDisabled: data.inputDisabled,
        },
      ]);
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

    const displayContent =
      text === "__help__" ? "J'ai besoin d'aide pour cette étape." : text;
    setInfoMessages((prev) => [
      ...prev,
      { role: "user", content: displayContent },
    ]);
    setInfoInput("");
    setInfoSending(true);
    setInfoInputDisabled(false);

    try {
      const res = await fetch(`/api/public/chat/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: text }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      const data = await res.json();

      if (data.phase === "review") {
        setPhase("review");
        setAnswers(data.answers || {});
        return;
      }

      setInfoMessages((prev) => [
        ...prev,
        {
          role: "bot",
          content: data.botMessage,
          options: data.options,
          suggestions: data.suggestions,
          inputDisabled: data.inputDisabled,
        },
      ]);
      setInfoInputDisabled(data.inputDisabled ?? false);
      if (data.nextStep !== undefined) setInfoStep(data.nextStep);
      if (data.totalFields) setTotalInfoFields(data.totalFields);
      if (data.currentFieldLabel !== undefined)
        setCurrentFieldLabel(data.currentFieldLabel);
    } catch (err: any) {
      setInfoMessages((prev) => [
        ...prev,
        { role: "bot", content: err.message || "Erreur. Réessayez." },
      ]);
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
    if (!res.ok) {
      setError("Erreur lors de la confirmation.");
      return;
    }
    const data = await res.json();
    setPhase("scenario");
    setAnswers(data.answers || {});
    setScenarios(data.scenarios || []);
    setActiveScenario(0);
    const firstSteps = data.scenarios?.[0]?.answers?.steps || [];
    setActiveStep(firstSteps.length > 0 ? 0 : null);
  };

  // ─── Scenario ───────────────────────────────────────────────

  const initStepChat = async (sIdx: number, stpIdx: number) => {
    if (stepMessages[sIdx]?.[stpIdx]?.length) return;
    try {
      const res = await fetch(
        `/api/public/chat/${token}/scenario/${sIdx}/step/${stpIdx}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userMessage: "__init__" }),
        },
      );
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.scenarios)) setScenarios(data.scenarios);
      setStepMessages((prev) => ({
        ...prev,
        [sIdx]: {
          ...(prev[sIdx] || {}),
          [stpIdx]: [
            {
              role: "bot",
              content: data.botMessage,
              options: null,
              suggestions: data.suggestions,
              inputDisabled: false,
            },
          ],
        },
      }));
      if (data.stepComplete)
        setStepComplete((prev) => ({
          ...prev,
          [sIdx]: { ...(prev[sIdx] || {}), [stpIdx]: true },
        }));
      if (data.done) setScenarioDone((prev) => ({ ...prev, [sIdx]: true }));
    } catch {
      setStepMessages((prev) => ({
        ...prev,
        [sIdx]: {
          ...(prev[sIdx] || {}),
          [stpIdx]: [{ role: "bot", content: "Erreur de connexion." }],
        },
      }));
    }
  };

  const sendStepMessage = async (text: string) => {
    if (
      !text.trim() ||
      stepSending ||
      activeScenario === null ||
      activeStep === null
    )
      return;

    const displayContent =
      text === "__help__" ? "J'ai besoin d'aide pour cette étape." : text;
    const sIdx = activeScenario;
    const stpIdx = activeStep;
    const msgs = stepMessages[sIdx]?.[stpIdx] || [];
    const userTurn: ChatMessage = { role: "user", content: displayContent };
    const optimisticMsgs: ChatMessage[] = [...msgs, userTurn];
    setStepMessages((prev) => ({
      ...prev,
      [sIdx]: { ...(prev[sIdx] || {}), [stpIdx]: optimisticMsgs },
    }));
    setStepInput("");
    setStepSending(true);

    try {
      const res = await fetch(
        `/api/public/chat/${token}/scenario/${sIdx}/step/${stpIdx}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userMessage: text }),
        },
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      const data = await res.json();
      if (Array.isArray(data.scenarios)) setScenarios(data.scenarios);
      const botTurn: ChatMessage = {
        role: "bot",
        content: data.botMessage,
        options: null,
        suggestions: data.suggestions,
        inputDisabled: false,
      };
      setStepMessages((prev) => ({
        ...prev,
        [sIdx]: {
          ...(prev[sIdx] || {}),
          [stpIdx]: [...optimisticMsgs, botTurn],
        },
      }));
      if (data.stepComplete)
        setStepComplete((prev) => ({
          ...prev,
          [sIdx]: { ...(prev[sIdx] || {}), [stpIdx]: true },
        }));
      if (data.done) setScenarioDone((prev) => ({ ...prev, [sIdx]: true }));
    } catch (err: any) {
      const errTurn: ChatMessage = {
        role: "bot",
        content: err.message || "Erreur. Réessayez.",
      };
      setStepMessages((prev) => ({
        ...prev,
        [sIdx]: {
          ...(prev[sIdx] || {}),
          [stpIdx]: [...optimisticMsgs, errTurn],
        },
      }));
    } finally {
      setStepSending(false);
    }
  };

  const selectStep = (stpIdx: number) => {
    if (activeScenario === null) return;
    if (activeStep === stpIdx) return;
    setActiveStep(stpIdx);
    if (!stepMessages[activeScenario]?.[stpIdx]?.length)
      initStepChat(activeScenario, stpIdx);
  };

  const selectScenario = (i: number) => {
    if (activeScenario === i) return;
    setActiveScenario(i);
    const sc = scenarios[i];
    const steps = sc?.answers?.steps || [];
    if (steps.length > 0) {
      setActiveStep(0);
      if (!stepMessages[i]?.[0]?.length) initStepChat(i, 0);
    } else {
      setActiveStep(null);
    }
    setStepInput("");
  };

  const addStep = async () => {
    if (activeScenario === null || stepSending) return;
    const res = await fetch(
      `/api/public/chat/${token}/scenario/${activeScenario}/step/add`,
      { method: "POST" },
    );
    if (!res.ok) return;
    const data = await res.json();
    setScenarios(data.scenarios);
    setScenarioDone((prev) => ({ ...prev, [activeScenario]: false }));
    setActiveStep(data.stepIndex);
    setStepInput("");
    initStepChat(activeScenario, data.stepIndex);
  };

  const deleteStep = async (stpIdx: number) => {
    if (activeScenario === null) return;
    if (!window.confirm("Supprimer cette étape ? Cette action est irréversible."))
      return;
    const res = await fetch(
      `/api/public/chat/${token}/scenario/${activeScenario}/step/${stpIdx}/delete`,
      { method: "POST" },
    );
    if (!res.ok) return;
    const data = await res.json();
    setScenarios(data.scenarios);
    setScenarioDone((prev) => ({ ...prev, [activeScenario]: false }));
    const stepsAfter = data.scenarios[activeScenario]?.answers?.steps || [];
    setStepMessages((prev) => ({ ...prev, [activeScenario]: {} }));
    setStepComplete((prev) => ({ ...prev, [activeScenario]: {} }));
    setStepInput("");
    if (stepsAfter.length > 0) {
      setActiveStep(0);
      initStepChat(activeScenario, 0);
    } else {
      setActiveStep(null);
    }
  };

  const finishScenario = async () => {
    if (activeScenario === null) return;
    const res = await fetch(
      `/api/public/chat/${token}/scenario/${activeScenario}/finalize`,
      { method: "POST" },
    );
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.scenarios)) setScenarios(data.scenarios);
    setScenarioDone((prev) => ({ ...prev, [activeScenario]: true }));
  };

  const addScenario = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!addName.trim() || addingScenario) return;
    setAddingScenario(true);
    try {
      const res = await fetch(`/api/public/chat/${token}/scenario/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addName.trim() }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setScenarios(data.scenarios);
      setAddName("");
      setShowAddModal(false);
      const newIdx = data.scenarios.length - 1;
      setActiveScenario(newIdx);
      setActiveStep(null);
      setScenarioDone((prev) => ({ ...prev, [newIdx]: false }));
      setStepMessages((prev) => ({ ...prev, [newIdx]: {} }));
      setStepComplete((prev) => ({ ...prev, [newIdx]: {} }));
      setStepInput("");
    } finally {
      setAddingScenario(false);
    }
  };

  const renameScenario = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (renameTarget === null || !renameName.trim() || renamingScenario) return;
    setRenamingScenario(true);
    try {
      const res = await fetch(
        `/api/public/chat/${token}/scenario/rename/${renameTarget}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: renameName.trim() }),
        },
      );
      if (!res.ok) return;
      const data = await res.json();
      setScenarios(data.scenarios);
      setRenameTarget(null);
      setRenameName("");
    } finally {
      setRenamingScenario(false);
    }
  };

  const deleteScenario = async (sIdx: number) => {
    if (!window.confirm("Supprimer ce scénario ? Cette action est irréversible.")) return;
    const res = await fetch(
      `/api/public/chat/${token}/scenario/delete/${sIdx}`,
      {
        method: "POST",
      },
    );
    if (!res.ok) return;
    const data = await res.json();
    setScenarios(data.scenarios);
    setStepMessages({});
    setStepComplete({});
    setStepInput("");
    const count = data.scenarios.length;
    if (count === 0) {
      setActiveScenario(null);
      setActiveStep(null);
      return;
    }
    if (activeScenario === sIdx) {
      setActiveScenario(0);
      const steps = data.scenarios[0]?.answers?.steps || [];
      setActiveStep(steps.length > 0 ? 0 : null);
      if (steps.length > 0) initStepChat(0, 0);
    } else if (activeScenario !== null && activeScenario > sIdx) {
      const shifted = activeScenario - 1;
      setActiveScenario(shifted);
      const steps = data.scenarios[shifted]?.answers?.steps || [];
      setActiveStep(steps.length > 0 ? 0 : null);
      if (steps.length > 0) initStepChat(shifted, 0);
    }
  };

  const finishProject = async () => {
    await fetch(`/api/public/chat/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userMessage: "__scenario_done__" }),
    });
    setPhase("completed");
  };

  const backToReview = async () => {
    try {
      const res = await fetch(`/api/public/chat/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: "__back_to_review__" }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setPhase("review");
      setAnswers(data.answers || {});
    } catch {
      /* ignore */
    }
  };

  const resetChat = async () => {
    if (
      !window.confirm(
        "Tout réinitialiser ? Toutes les réponses seront effacées.",
      )
    )
      return;
    try {
      const res = await fetch(`/api/public/chat/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: "__reset__" }),
      });
      if (!res.ok) return;
      setInfoMessages([]);
      setInfoStep(0);
      setInfoInputDisabled(false);
      setCurrentFieldLabel(null);
      setStepMessages({});
      setStepComplete({});
      setActiveStep(null);
      setScenarios([]);
      setActiveScenario(null);
      setPhase("info");
      await initChat();
    } catch {
      /* ignore */
    }
  };

  // ─── Render Helpers ──────────────────────────────────────────

  const renderMarkdown = (text?: string | null) => {
    const safeText = typeof text === "string" ? text : "";
    const parts = safeText.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      const lines = part.split("\n");
      return lines.map((line, j) => (
        <span key={`${i}-${j}`}>
          {line}
          {j < lines.length - 1 && <br />}
        </span>
      ));
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
    const progressPct = total > 0 ? Math.min((step / total) * 100, 100) : 0;
    return (
      <>
        <header className={styles.chatHeader}>
          <div className={styles.headerLeft}>
            <img
              src="/tadreex.png"
              alt="Tadreex"
              className={styles.headerLogo}
            />
            <div>
              <div className={styles.headerTitle}>Tadreex Creator</div>
              <div className={styles.headerSubtitle}>
                Assistant de conception VR
              </div>
            </div>
          </div>
          <div className={styles.headerRight}>
            <span className={styles.stepLabel}>
              {label
                ? total > 0
                  ? `${Math.min(step + 1, total)}/${total} — ${label}`
                  : label
                : ""}
            </span>
            {total > 0 && (
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}
            <button
              className={styles.resetBtn}
              onClick={resetChat}
              title="Réinitialiser le chat"
            >
              ↻ Réinitialiser
            </button>
          </div>
        </header>

        <main className={styles.messageList}>
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`${styles.messageRow} ${msg.role === "user" ? styles.userRow : styles.botRow}`}
            >
              {msg.role === "bot" && (
                <img
                  src="/chatbot-icon.png"
                  alt="Bot"
                  className={styles.avatar}
                />
              )}
              <div
                className={`${styles.bubble} ${msg.role === "user" ? styles.userBubble : styles.botBubble}`}
              >
                <div className={styles.bubbleText}>
                  {renderMarkdown(msg.content)}
                </div>
                {msg.role === "bot" && idx === messages.length - 1 && (
                  msg.suggestions && msg.suggestions.length > 0 ? (
                    <SuggestionPicker
                      suggestions={msg.suggestions}
                      disabled={sending || inputDisabled}
                      onValidate={(t) => send(t)}
                    />
                  ) : msg.options ? (
                    <div className={styles.optionButtons}>
                      {msg.options.map((opt) => (
                        <button
                          key={opt}
                          className={styles.optionBtn}
                          onClick={() => send(opt)}
                          disabled={sending}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  ) : null
                )}
              </div>
              {msg.role === "user" && (
                <img src="/user.png" alt="User" className={styles.userAvatar} />
              )}
            </div>
          ))}
          {sending && (
            <div className={`${styles.messageRow} ${styles.botRow}`}>
              <img
                src="/chatbot-icon.png"
                alt="Bot"
                className={styles.avatar}
              />
              <div
                className={`${styles.bubble} ${styles.botBubble} ${styles.typingBubble}`}
              >
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
              </div>
            </div>
          )}
          <div ref={chatBottomRef} />
        </main>

        <footer className={styles.inputBar}>
          <button
            className={styles.helpBtn}
            onClick={() => send("__help__")}
            disabled={sending}
            title="Aide"
          >
            <img src="/help.png" alt="Aide" className={styles.helpIcon} /> Aide
          </button>
          <textarea
            className={styles.textInput}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={
              inputDisabled
                ? "Choisissez ci-dessus..."
                : "Votre réponse... (Entrée)"
            }
            disabled={inputDisabled}
            rows={1}
          />
          <button
            className={styles.sendBtn}
            onClick={() => send(input)}
            disabled={!input.trim() || sending || inputDisabled}
          >
            ➤
          </button>
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
          <p>
            Merci d&apos;avoir utilisé Tadreex Creator. Les informations sont
            enregistrées.
          </p>
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
            <img
              src="/tadreex.png"
              alt="Tadreex"
              className={styles.headerLogo}
            />
            <div>
              <div className={styles.headerTitle}>Tadreex Creator</div>
              <div className={styles.headerSubtitle}>
                Récapitulatif des informations
              </div>
            </div>
          </div>
          <div className={styles.headerRight}>
            <span className={styles.stepLabel}>Phase info — terminée</span>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: "100%" }} />
            </div>
            <button
              className={styles.resetBtn}
              onClick={resetChat}
              title="Réinitialiser le chat"
            >
              ↻ Réinitialiser
            </button>
          </div>
        </header>

        <main className={styles.reviewMain}>
          <h3 className={styles.reviewTitle}>Vérifiez vos réponses</h3>
          <p className={styles.reviewDesc}>
            Modifiez si nécessaire, puis confirmez.
          </p>

          <table className={styles.reviewTable}>
            <thead>
              <tr>
                <th>Champ</th>
                <th>Réponse</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(answers)
                .filter(([key]) => key !== "scenes")
                .map(([key, val]) => (
                  <tr key={key}>
                    <td className={styles.reviewLabel}>{key}</td>
                    <td className={styles.reviewValue}>
                      {editingKey === key ? (
                        <input
                          className={styles.reviewInput}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit();
                          }}
                          autoFocus
                        />
                      ) : Array.isArray(val) ? (
                        val.join(", ")
                      ) : (
                        String(val)
                      )}
                    </td>
                    <td className={styles.reviewAction}>
                      {editingKey === key ? (
                        <button
                          className={styles.reviewSaveBtn}
                          onClick={saveEdit}
                        >
                          ✓
                        </button>
                      ) : (
                        <button
                          className={styles.reviewEditBtn}
                          onClick={() => startEdit(key, val)}
                        >
                          ✎
                        </button>
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
    const sc = activeScenario !== null ? scenarios[activeScenario] : null;
    const stepList: ScenarioStep[] = sc ? sc.answers?.steps || [] : [];
    const activeMsgs =
      activeScenario !== null && activeStep !== null
        ? stepMessages[activeScenario]?.[activeStep] || []
        : [];
    const activeStepComplete =
      activeScenario !== null && activeStep !== null
        ? !!(stepComplete[activeScenario]?.[activeStep])
        : false;
    const activeScenarioDone =
      activeScenario !== null ? !!scenarioDone[activeScenario] : false;
    const allDone =
      scenarios.length > 0 && scenarios.every((_, i) => scenarioDone[i]);
    const activeStepObj =
      activeScenario !== null && activeStep !== null
        ? stepList[activeStep]
        : undefined;

    return (
      <div className={styles.chatPage}>
        <header className={styles.chatHeader}>
          <div className={styles.headerLeft}>
            <img
              src="/tadreex.png"
              alt="Tadreex"
              className={styles.headerLogo}
            />
            <div>
              <div className={styles.headerTitle}>Tadreex Creator</div>
              <div className={styles.headerSubtitle}>
                Construction des scénarios
              </div>
            </div>
          </div>
          <div className={styles.headerRight}>
            <span className={styles.stepLabel}>
              {scenarios.length} scénario(s)
            </span>
            <div className={styles.headerActions}>
              <button
                className={styles.resetBtn}
                onClick={backToReview}
                title="Retour aux réponses des questions générales"
              >
                ← Réponses
              </button>
              <button
                className={styles.resetBtn}
                onClick={resetChat}
                title="Réinitialiser le chat"
              >
                ↻ Réinitialiser
              </button>
            </div>
          </div>
        </header>

        <div className={styles.scenarioLayout}>
          <aside className={styles.scenarioSidebar}>
            <div className={styles.scenarioList}>
              {scenarios.map((sc, i) => (
                <div
                  key={i}
                  className={`${styles.scenarioTab} ${activeScenario === i ? styles.scenarioTabActive : ""} ${scenarioDone[i] ? styles.scenarioTabDone : ""}`}
                  onClick={() => selectScenario(i)}
                  title={sc.name}
                >
                  <span className={styles.scenarioTabName}>{sc.name}</span>
                  <div className={styles.scenarioTabActions}>
                    {scenarioDone[i] && (
                      <span className={styles.scenarioCheck}>✓</span>
                    )}
                    <button
                      className={styles.scenarioIconBtn}
                      title="Renommer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenameTarget(i);
                        setRenameName(sc.name);
                      }}
                    >
                      ✎
                    </button>
                    <button
                      className={`${styles.scenarioIconBtn} ${styles.scenarioIconDanger}`}
                      title="Supprimer"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteScenario(i);
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
              {scenarios.length === 0 && (
                <div className={styles.scenarioEmpty}>
                  Aucun scénario. Ajoutez-en un pour commencer.
                </div>
              )}
            </div>

            <div className={styles.scenarioAdd}>
              <button
                className={styles.scenarioAddBtn}
                onClick={() => setShowAddModal(true)}
              >
                + Ajouter un scénario
              </button>
            </div>

            {scenarios.length > 0 && (
              <div className={styles.scenarioActions}>
                {allDone && (
                  <button className={styles.finishBtn} onClick={finishProject}>
                    Terminer le projet
                  </button>
                )}
              </div>
            )}
          </aside>

          <div className={styles.stepPanel}>
            <div className={styles.stepPanelHeader}>
              <span className={styles.stepPanelTitle}>
                {sc?.name || "Scénario"}
              </span>
              {sc && (
                <div className={styles.scenarioHeaderActions}>
                  <button
                    className={styles.scenarioHeaderBtn}
                    title="Renommer le scénario"
                    onClick={() => {
                      setRenameTarget(activeScenario);
                      setRenameName(sc.name || "");
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className={styles.scenarioDeleteBtn}
                    title="Supprimer le scénario"
                    onClick={() => deleteScenario(activeScenario!)}
                  >
                    🗑
                  </button>
                </div>
              )}
            </div>

            {stepList.length === 0 ? (
              <div className={styles.stepNodeEmpty}>
                <p>Aucune étape pour l'instant.</p>
                <button className={styles.stepAddBtn} onClick={addStep}>
                  + Ajouter une étape
                </button>
              </div>
            ) : (
              <>
                <div className={styles.stepNodeList}>
                  {stepList.map((st, i) => {
                    const isComplete = !!stepComplete[activeScenario!]?.[i];
                    const isActive = activeStep === i;
                    return (
                      <div
                        key={i}
                        className={`${styles.stepNodeRow} ${isActive ? styles.stepNodeRowActive : ""} ${isComplete ? styles.stepNodeRowDone : ""}`}
                      >
                        <span className={styles.stepNodeDot} />
                        <button
                          className={styles.stepNodeBtn}
                          onClick={() => selectStep(i)}
                          title={st.titre || `Étape ${i + 1}`}
                        >
                          <span className={styles.stepNodeNum}>
                            Étape {st.numero || i + 1}
                          </span>
                          <span className={styles.stepNodeTitle}>
                            {st.titre || "Sans intitulé"}
                          </span>
                          {isComplete && (
                            <span className={styles.stepNodeCheck}>✓</span>
                          )}
                        </button>
                        <button
                          className={styles.stepNodeDelete}
                          title="Supprimer cette étape"
                          onClick={() => deleteStep(i)}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className={styles.stepPanelFooter}>
                  <button className={styles.stepAddBtn} onClick={addStep}>
                    + Ajouter une étape
                  </button>
                  {activeScenarioDone ? (
                    <div className={styles.scenarioDoneBanner}>
                      ✓ Scénario terminé
                    </div>
                  ) : (
                    <button
                      className={styles.finishScenarioBtn}
                      onClick={finishScenario}
                    >
                      Terminer le scénario
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className={styles.scenarioChatArea}>
            {activeScenario === null ? (
              <div className={styles.selectPrompt}>
                Sélectionnez ou ajoutez un scénario
              </div>
            ) : activeStep === null ? (
              <div className={styles.selectPrompt}>
                <button className={styles.startScenarioBtn} onClick={addStep}>
                  + Ajouter la première étape
                </button>
              </div>
            ) : (
              <>
                <div className={styles.scenarioChatHeader}>
                  <span className={styles.scenarioNameTag}>
                    Étape {activeStep + 1}
                    {activeStepObj?.titre ? ` — ${activeStepObj.titre}` : ""}
                  </span>
                  <span
                    className={`${styles.stepBadge} ${activeStepComplete ? styles.stepBadgeDone : ""}`}
                  >
                    {activeStepComplete ? "✓ Complétée" : "En cours"}
                  </span>
                </div>
                {activeMsgs.length === 0 ? (
                  <div className={styles.selectPrompt}>
                    <button
                      className={styles.startScenarioBtn}
                      onClick={() =>
                        initStepChat(activeScenario!, activeStep!)
                      }
                    >
                      Ouvrir la conversation
                    </button>
                  </div>
                ) : (
                  renderChat(
                    activeMsgs,
                    stepInput,
                    setStepInput,
                    sendStepMessage,
                    stepSending,
                    activeScenarioDone,
                    null,
                    0,
                    0,
                  )
                )}
              </>
            )}
          </div>
        </div>

        {showAddModal && (
          <div
            className={styles.scenarioModalOverlay}
            onClick={() => setShowAddModal(false)}
          >
            <div
              className={styles.scenarioModal}
              onClick={(e) => e.stopPropagation()}
            >
              <h2>Nouveau scénario</h2>
              <form onSubmit={addScenario}>
                <input
                  className={styles.scenarioNameInput}
                  autoFocus
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder={`Scénario ${scenarios.length + 1}`}
                  disabled={addingScenario}
                />
                <div className={styles.scenarioModalActions}>
                  <button
                    type="button"
                    className={styles.scenarioModalCancel}
                    onClick={() => setShowAddModal(false)}
                    disabled={addingScenario}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className={styles.scenarioModalConfirm}
                    disabled={!addName.trim() || addingScenario}
                  >
                    {addingScenario ? "Création..." : "Créer"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {renameTarget !== null && (
          <div
            className={styles.scenarioModalOverlay}
            onClick={() => setRenameTarget(null)}
          >
            <div
              className={styles.scenarioModal}
              onClick={(e) => e.stopPropagation()}
            >
              <h2>Renommer le scénario</h2>
              <form onSubmit={renameScenario}>
                <input
                  className={styles.scenarioNameInput}
                  autoFocus
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  disabled={renamingScenario}
                />
                <div className={styles.scenarioModalActions}>
                  <button
                    type="button"
                    className={styles.scenarioModalCancel}
                    onClick={() => setRenameTarget(null)}
                    disabled={renamingScenario}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className={styles.scenarioModalConfirm}
                    disabled={!renameName.trim() || renamingScenario}
                  >
                    {renamingScenario ? "Enregistrement..." : "Enregistrer"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Info ───────────────────────────────────────────────────

  return (
    <div className={styles.chatPage}>
      {renderChat(
        infoMessages,
        infoInput,
        setInfoInput,
        sendInfoMessage,
        infoSending,
        infoInputDisabled,
        currentFieldLabel,
        infoStep,
        totalInfoFields,
      )}
    </div>
  );
}
