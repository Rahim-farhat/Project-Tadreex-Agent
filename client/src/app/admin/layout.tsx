"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/api";
import { Icon, IconName } from "@/components/Icon";
import styles from "./admin.module.css";

const NAV: { title: string; items: { href: string; label: string; icon: IconName }[] }[] = [
  {
    title: "Workspace",
    items: [
      { href: "/admin", label: "Overview", icon: "overview" },
      { href: "/admin/projects", label: "Projects", icon: "projects" },
    ],
  },
  {
    title: "Configuration",
    items: [
      { href: "/admin/fields", label: "Chat fields", icon: "chat" },
      { href: "/admin/scenario-fields", label: "Scenario fields", icon: "scenario" },
      { href: "/admin/settings", label: "AI settings", icon: "settings" },
    ],
  },
  {
    title: "Access",
    items: [{ href: "/admin/users", label: "Users", icon: "users" }],
  },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    if (current === "light" || current === "dark") setTheme(current);
  }, []);

  // Close the mobile drawer on navigation
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("tadreex-theme", next);
    } catch {
      /* ignore */
    }
  };

  // The login page renders on its own, without the admin shell
  if (pathname?.startsWith("/admin/login")) {
    return <>{children}</>;
  }

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname?.startsWith(href);

  const brand = (
    <div className={styles.brand}>
      <img src="/tadreex.png" alt="" className={styles.logoImg} />
      <div className={styles.brandText}>
        <span className={styles.brandName}>Scenarios</span>
        <span className={styles.brandSub}>Platform · Tadreex</span>
      </div>
    </div>
  );

  return (
    <div className={styles.shell}>
      <header className={styles.mobileBar}>
        <button
          className={styles.menuBtn}
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Open menu"
          aria-expanded={menuOpen}
        >
          <span />
          <span />
          <span />
        </button>
        {brand}
      </header>

      {menuOpen && (
        <div className={styles.backdrop} onClick={() => setMenuOpen(false)} />
      )}

      <aside className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.sidebarLogo}>{brand}</div>
        <nav className={styles.nav}>
          {NAV.map((group) => (
            <div key={group.title} className={styles.navGroup}>
              <div className={styles.navGroupTitle}>{group.title}</div>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navItem} ${isActive(item.href) ? styles.navItemActive : ""}`}
                  aria-current={isActive(item.href) ? "page" : undefined}
                >
                  <Icon name={item.icon} className={styles.navIcon} />
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <button onClick={toggleTheme} className={styles.footerBtn}>
            <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <button onClick={logout} className={`${styles.footerBtn} ${styles.logoutBtn}`}>
            <Icon name="logout" size={16} />
            Log out
          </button>
        </div>
      </aside>

      <main className={styles.content}>
        <div className={styles.contentInner}>{children}</div>
      </main>
    </div>
  );
}
