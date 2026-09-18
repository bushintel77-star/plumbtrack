import {
  BarChart3,
  Briefcase,
  Building2,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Radio,
  Settings,
  Table2,
  Users
} from "lucide-react"

import type { AppModule } from "@/types"

export interface NavItem {
  id: AppModule
  label: string
  icon: typeof LayoutDashboard
  enabled: boolean
  milestone: string
}

export const NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, enabled: true, milestone: "" },
  { id: "dispatch", label: "Dispatch", icon: Table2, enabled: true, milestone: "" },
  { id: "operations", label: "Operations", icon: Radio, enabled: true, milestone: "" },
  { id: "crews", label: "Crews", icon: Users, enabled: true, milestone: "" },
  { id: "jobs", label: "Jobs", icon: Briefcase, enabled: true, milestone: "" },
  { id: "customers", label: "Customers", icon: Building2, enabled: true, milestone: "" },
  { id: "forms", label: "Forms", icon: FileText, enabled: true, milestone: "" },
  { id: "reports", label: "Reports", icon: BarChart3, enabled: true, milestone: "" },
  { id: "accounting", label: "Accounting", icon: FileText, enabled: true, milestone: "" },
  { id: "slack", label: "Slack", icon: MessageSquare, enabled: true, milestone: "" },
  { id: "setup", label: "Setup", icon: Settings, enabled: true, milestone: "" }
]

/**
 * The nav as this role should see it. `setup` is *company* setup — the API
 * gates its writes to owner/admin — so it only appears for them: a
 * technician would hit an error screen, and a dispatcher would read the
 * company's pricing and compliance answers in a form whose saves all 403.
 * A null/unknown role gets the non-setup list; the session gate holds the
 * console until the role resolves, so this only deprives demo renders.
 */
export function visibleNav(role: string | null): NavItem[] {
  if (role === "owner" || role === "admin") return NAV
  return NAV.filter(item => item.id !== "setup")
}
