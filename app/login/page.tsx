import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="login-page">
      <div className="login-card">
        <div>
          <div className="wordmark">Internal Tools</div>
          <p className="eyebrow" style={{ marginTop: 4 }}>Sign in</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
