import { describe, expect, it } from "vitest"
import { personColor, personOrder, statusPrecedence, statusStyles } from "@/lib/statusStyles"
import type { Job, Technician } from "@/types"

const job = (status: Job["status"], priority: Job["priority"] = "normal") => ({ status, priority })

describe("semantic status contract", () => {
  it("keeps all job statuses exhaustive", () => {
    expect(Object.keys(statusStyles).sort()).toEqual(["active", "complete", "delayed", "en_route", "scheduled", "unassigned"])
  })

  it("gives emergency highest precedence", () => {
    expect(statusPrecedence(job("active", "emergency"))).toBe("active")
    expect(statusPrecedence(job("scheduled", "emergency"))).toBe("active")
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
