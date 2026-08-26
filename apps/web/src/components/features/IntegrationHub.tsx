"use client";

import { useState } from "react";
import { Link2, FileText, Users, Camera, CreditCard, Settings, Check } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

type Integration = {
  id: string;
  name: string;
  icon: typeof Link2;
  description: string;
  status: "connected" | "disconnected" | "configure";
};

const integrations: Integration[] = [
  {
    id: "xero",
    name: "Xero Accounting",
    icon: FileText,
    description: "Push invoices, sync job costs, manage progress claims and retention. Two-way sync keeps your books and field in lockstep.",
    status: "disconnected",
  },
  {
    id: "plans",
    name: "Plan & BIM Viewer",
    icon: Settings,
    description: "Open hydraulic drawings, pin photos to gridlines, track RFIs and concealed works evidence against live plans.",
    status: "disconnected",
  },
  {
    id: "payroll",
    name: "Payroll Export",
    icon: Users,
    description: "Export geofenced time entries with cost codes to Deputy, Employment Hero, or native payroll. EBA rates and allowances supported.",
    status: "disconnected",
  },
  {
    id: "photos",
    name: "Evidence Photos",
    icon: Camera,
    description: "Auto-organized, timestamped photo documentation — before/during/after shots linked to concealed works sign-off.",
    status: "disconnected",
  },
  {
    id: "payments",
    name: "Payment Gateway",
    icon: CreditCard,
    description: "Embed Stripe payment links in invoices and progress claims. Auto-reconciles when client pays.",
    status: "disconnected",
  },
];

export function IntegrationHub() {
  const [items] = useState<Integration[]>(integrations);

  return (
    <GlassCard>
      <h3 className="text-ink font-semibold text-sm mb-3">Integration Hub</h3>
      <p className="text-xs text-ink-low mb-4 leading-relaxed">
        Connect PlumbTrack to your existing software stack. Each integration routes through the notification
        dispatcher — downstream relays never block field operations.
      </p>
      <div className="space-y-2">
        {items.map((int) => (
          <div
            key={int.id}
            className="flex items-start gap-3 p-3 rounded-xl border border-line bg-fill"
          >
            <div className="w-8 h-8 rounded-lg bg-fill-strong flex items-center justify-center shrink-0 mt-0.5">
              <int.icon size={15} className="text-ink-low" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink">{int.name}</p>
              <p className="text-[11px] text-ink-low mt-0.5 leading-relaxed">{int.description}</p>
            </div>
            <span
              className={`shrink-0 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full mt-0.5 ${
                int.status === "connected"
                  ? "bg-accent/15 text-accent border border-accent/30"
                  : "bg-fill-strong text-ink-low border border-line"
              }`}
            >
              {int.status === "connected" ? "Connected" : "Setup"}
            </span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}