import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";

/**
 * Every tool page lives under app/(tools)/<tool>/ and gets the AppShell.
 * Redirecting anonymous users to /login here is a convenience; authorization
 * for data still happens in the API routes via requireRole.
 */
export default async function ToolsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <AppShell user={{ email: user.email, role: user.role }}>{children}</AppShell>;
}
