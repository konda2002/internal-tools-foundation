"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Role } from "@/lib/auth";
import { navForRole } from "@/lib/nav";
import { ActionButton } from "@/components/ActionButton";

type Props = {
  user: { email: string; role: Role };
  children: React.ReactNode;
};

/**
 * Page chrome: sidebar nav + content. The nav only lists pages the user's role
 * can access (lib/nav.ts). Hiding a link is a courtesy, not a security
 * boundary — the API routes behind each page enforce access with requireRole.
 */
export function AppShell({ user, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const items = navForRole(user.role);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="wordmark">Internal Tools</div>
        <nav className="nav" aria-label="Main">
          {items.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : undefined}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div>
            <div className="eyebrow">Signed in</div>
            <div style={{ wordBreak: "break-all" }}>{user.email}</div>
            <span className="pill" style={{ marginTop: 4 }}>{user.role}</span>
          </div>
          <ActionButton variant="secondary" onClick={logout}>
            Sign out
          </ActionButton>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
