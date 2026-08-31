"use client";

import { useEffect, useState } from "react";
import "./admin.module.css";

function ModelInput() {
  const [model, setModel] = useState("");
  const [status, setStatus] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const token =
          typeof window !== "undefined" ? localStorage.getItem("token") : null;
        const res = await fetch("/api/admin/settings/model", {
          credentials: "include",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted) return;
        setModel(data.model || "");
      } catch {
        /* ignore */
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const save = async () => {
    if (!isEditing) return;
    setSaving(true);
    setStatus("");
    setErrorMsg("");
    try {
      const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch("/api/admin/settings/model", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ model }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          (body && (body.message || body.error || body.err)) ||
          `HTTP ${res.status}`;
        setErrorMsg(String(msg));
        return;
      }
      setStatus("Saved");
      setIsEditing(false);
      setErrorMsg("");
      setTimeout(() => setStatus(""), 2000);
    } catch (err) {
      setErrorMsg((err as any)?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = () => {
    if (saving) return;
    setIsEditing(true);
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, opacity: 0.8 }}>Model</div>
      <div
        style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}
      >
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="llama-3.x-..."
          style={{ flex: 1 }}
          disabled={!isEditing}
        />
        {!isEditing ? (
          <button
            onClick={startEdit}
            style={{ padding: "6px 8px" }}
            disabled={saving}
            title="Edit model"
          >
            Edit
          </button>
        ) : (
          <button
            onClick={save}
            style={{ padding: "6px 8px" }}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        )}
      </div>
      {errorMsg && (
        <div style={{ color: "crimson", fontSize: 12, marginTop: 6 }}>
          {errorMsg}
        </div>
      )}
      {status && !errorMsg && (
        <div style={{ color: "green", fontSize: 12, marginTop: 6 }}>
          {status}
        </div>
      )}
    </div>
  );
}
import styles from "./admin.module.css";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = localStorage.getItem("tadreex-theme") as
      | "dark"
      | "light"
      | null;
    if (saved) setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("tadreex-theme", theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <img src="/tadreex.png" alt="Tadreex" className={styles.logoImg} />
          <span>Tadreex</span>
        </div>
        <nav className={styles.nav}>
          <a href="/admin" className={styles.navItem}>
            <img
              src="/overview.png"
              alt="Overview"
              className={styles.navIcon}
            />{" "}
            Overview
          </a>
          <a href="/admin/projects" className={styles.navItem}>
            <img
              src="/projects.png"
              alt="Projects"
              className={styles.navIcon}
            />{" "}
            Projects
          </a>
          <a href="/admin/fields" className={styles.navItem}>
            <img
              src="/chat-fields.png"
              alt="Chat Fields"
              className={styles.navIcon}
            />{" "}
            Chat Fields
          </a>
          <a href="/admin/scenario-fields" className={styles.navItem}>
            <img
              src="/scenario.png"
              alt="Scenario Fields"
              className={styles.navIcon}
            />{" "}
            Scenario Fields
          </a>
          <a href="/admin/users" className={styles.navItem}>
            <img src="/uers.png" alt="Users" className={styles.navIcon} /> Users
          </a>
        </nav>
        <div className={styles.sidebarFooter}>
          <button onClick={toggle} className={styles.themeToggle}>
            <img
              src="/night-light-mode.png"
              alt="Theme"
              className={styles.themeIcon}
            />{" "}
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <div className={styles.modelConfig}>
            <ModelInput />
          </div>
        </div>
      </aside>

      <main className={styles.content}>{children}</main>
    </div>
  );
}
