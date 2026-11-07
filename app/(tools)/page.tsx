import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { navForRole } from "@/lib/nav";

export default async function HomePage() {
  // The (tools) layout also redirects, but Next renders layout and page in
  // parallel, so the page must handle the anonymous case itself.
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const tools = navForRole(user.role).filter((i) => i.href !== "/");
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Home</h1>
          <p>
            Signed in as {user.email} · <span className="pill">{user.role}</span>
          </p>
        </div>
      </div>
      <div className="notice">
        <p className="eyebrow">Available tools</p>
        {tools.length === 0 ? (
          <p style={{ marginTop: 8 }}>No tools are available for your role yet.</p>
        ) : (
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {tools.map((t) => (
              <li key={t.href}>
                <a href={t.href} style={{ textDecoration: "underline" }}>{t.label}</a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
