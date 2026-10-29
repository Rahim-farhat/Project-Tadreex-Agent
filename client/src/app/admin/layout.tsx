"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getCurrentUser, logout, SessionUser } from "@/lib/api";
import { Icon, IconName } from "@/components/Icon";
import styles from "./admin.module.css";

interface NavGroup {
  title: string;
  items: { href: string; label: string; icon: IconName }[];
}

const ADMIN_ONLY_PATHS = [
  "/admin/fields",
  "/admin/scenario-fields",
  "/admin/settings",
  "/admin/managers",
  "/admin/users",
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

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

  const isManager = user?.role === "manager";
  const isBlocked = isManager && ADMIN_ONLY_PATHS.some((path) => pathname?.startsWith(path));

  const navGroups: NavGroup[] = useMemo(() => {
    const workspaceGroup: NavGroup = {
      title: "Workspace",
      items: [
        { href: "/admin", label: "Overview", icon: "overview" },
        { href: "/admin/projects", label: "Projects", icon: "projects" },
      ],
    };

    if (isManager) {
      return [workspaceGroup];
    }

    return [
      workspaceGroup,
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
        items: [{ href: "/admin/managers", label: "Managers", icon: "users" }],
      },
    ];
  }, [isManager]);

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
          {navGroups.map((group) => (
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
          {user && (
            <div className={styles.userBadge}>
              <div className={styles.userInfo}>
                <span className={styles.userName}>
                  {user.username || user.name || (user.role === 'admin' ? 'Admin' : 'Manager')}
                </span>
              </div>
              <span className={`${styles.userRole} ${user.role === 'admin' ? styles.roleAdmin : styles.roleManager}`}>
                {user.role}
              </span>
            </div>
          )}
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
        <div className={styles.contentInner}>
          {isBlocked ? (
            <div className={styles.unauthorizedBox}>
              <div className={styles.unauthorizedIcon}>🔒</div>
              <h1 className={styles.unauthorizedTitle}>Access Restricted</h1>
              <p className={styles.unauthorizedText}>
                Only administrators have permission to modify configuration settings and manage platform managers.
              </p>
              <Link href="/admin/projects" className={styles.unauthorizedBtn}>
                <Icon name="projects" size={16} /> Go to Projects
              </Link>
            </div>
          ) : (
            children
          )}
        </div>
      </main>
    </div>
  );
}
