import type { Role } from "@/lib/auth";

export type NavItem = { href: string; label: string; roles: readonly Role[] };

/**
 * Pages shown in the AppShell nav, filtered by the signed-in user's role.
 * This is a UI convenience only — every API route still enforces access with
 * requireRole. Add one entry per tool.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Home", roles: ["ANALYST", "OPS_LEAD"] },
  { href: "/refunds", label: "Refunds", roles: ["ANALYST", "OPS_LEAD"] },
  { href: "/kyc", label: "KYC review", roles: ["OPS_LEAD"] },
  { href: "/audit", label: "Audit log", roles: ["OPS_LEAD"] },
];

export function navForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
