import { describe, expect, it } from "vitest"
import { channelStyles, personColor, personOrder, statusPrecedence, statusStyleFor, statusStyles } from "@/lib/statusStyles"
import { Siren } from "lucide-react"
import type { Job, Technician } from "@/types"

const job = (status: Job["status"], priority: Job["priority"] = "normal") => ({ status, priority })

describe("semantic status contract", () => {
  it("keeps all job statuses exhaustive", () => {
    expect(Object.keys(statusStyles).sort()).toEqual(["active", "complete", "delayed", "en_route", "scheduled", "unassigned"])
  })

  it("gives emergency the urgent-red channel above any status, delayed above active", () => {
    // APPLICATION_MAP §6.2: an active emergency reads red, never teal.
    expect(statusPrecedence(job("active", "emergency"))).toBe("emergency")
    expect(statusPrecedence(job("scheduled", "emergency"))).toBe("emergency")
    expect(statusPrecedence(job("complete", "emergency"))).toBe("emergency")
    expect(statusPrecedence(job("delayed"))).toBe("delayed")
    expect(statusPrecedence(job("active"))).toBe("active")
    expect(channelStyles.emergency.badge).toBe("text-urgent")
    expect(channelStyles.emergency.icon).toBe(Siren)
    expect(statusStyleFor(job("active", "emergency")).chip).toContain("bg-urgent")
  })

  it("preserves explicit operational status otherwise", () => {
    expect(statusPrecedence(job("delayed"))).toBe("delayed")
    expect(statusPrecedence(job("en_route"))).toBe("en_route")
  })

  it("assigns identity colors from stable full-roster order", () => {
    const techs = ["t-z", "t-a", "t-m"].map(id => ({ id, name: id, van: "", skills: [], role: "Driver", absences: [] })) as Technician[]
    expect(personOrder(techs).map(tech => tech.id)).toEqual(["t-a", "t-m", "t-z"])
    expect(personColor(techs[0], techs)).toBe("var(--person-3)")
    expect(personColor(techs[0], techs.filter(tech => tech.id !== "t-a"))).toBe("var(--person-3)")
  })
})
