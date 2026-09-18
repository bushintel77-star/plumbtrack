"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, X } from "lucide-react"

import { apiErrorMessage, team, type TeamMember } from "@/lib/api"
import { SKILLS } from "@/types"
import { cn } from "@/lib/utils"

/**
 * The Crews module: the org roster with per-member skill tags. Skills are
 * what make a technician assignable to a job that declares a
 * `requiredSkill` — without this surface an invited junior was stuck
 * unassignable forever. Owner/admin edit (free-form, matching the API —
 * the SKILLS list is quick-picks, not an enum); every other office role
 * sees the roster read-only.
 */
export function TeamRoster({ role }: { role: string | null }) {
  const canEdit = role === "owner" || role === "admin"
  const queryClient = useQueryClient()
  const members = useQuery({ queryKey: ["team-members"], queryFn: () => team.members() })
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: ({ userId, skills }: { userId: string; skills: string[] }) => team.setSkills(userId, skills),
    onSuccess: () => {
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ["team-members"] })
    },
    onError: err => setError(apiErrorMessage(err, "Couldn't save the skills — try again."))
  })

  const setSkills = (member: TeamMember, skills: string[]) => save.mutate({ userId: member.userId, skills })

  return (
    <div className="scrollbar-thin h-full overflow-auto p-4" data-testid="team-roster">
      <div className="flex items-end justify-between">
        <div>
          <div className="label-mono text-2xs text-chrome-400">CREWS</div>
          <h2 className="mt-1 text-lg font-bold">Team roster</h2>
          <p className="mt-1 text-xs text-ink-mid">
            Skills decide who can take a job that needs one.
            {!canEdit && " Only owners and admins can change them."}
          </p>
        </div>
        <span className="label-mono text-2xs text-ink-low">
          {members.data ? `${members.data.members.length} MEMBERS` : "LIVE"}
        </span>
      </div>

      {members.isLoading && <p className="mt-4 text-xs text-ink-low">Loading the team…</p>}
      {members.error && (
        <p className="mt-4 text-xs text-pending">
          {apiErrorMessage(members.error, "The roster didn't load — the API may be unreachable.")}
        </p>
      )}
      {error && (
        <p className="mt-4 text-xs text-urgent" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {members.data?.members.map(member => (
          <MemberRow
            key={member.userId}
            member={member}
            canEdit={canEdit}
            saving={save.isPending}
            onAdd={skill => setSkills(member, [...member.skills, skill])}
            onRemove={skill => setSkills(member, member.skills.filter(s => s !== skill))}
          />
        ))}
        {members.data && members.data.members.length === 0 && (
          <p className="text-xs text-ink-low">No one on the team yet — invite them from Setup.</p>
        )}
      </div>
    </div>
  )
}

function MemberRow({
  member,
  canEdit,
  saving,
  onAdd,
  onRemove
}: {
  member: TeamMember
  canEdit: boolean
  saving: boolean
  onAdd: (skill: string) => void
  onRemove: (skill: string) => void
}) {
  const [draft, setDraft] = useState("")
  const suggestions = SKILLS.filter(skill => !member.skills.includes(skill))

  const add = (skill: string) => {
    const trimmed = skill.trim()
    if (!trimmed) return
    setDraft("")
    onAdd(trimmed)
  }

  return (
    <section className="panel p-3" data-testid={`team-member-${member.userId}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold">{member.name ?? member.email}</div>
          <div className="truncate text-2xs text-ink-low">{member.email}</div>
        </div>
        <span className="label-mono text-2xs text-chrome-400">{member.role.toUpperCase()}</span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {member.skills.map(skill => (
          <span key={skill} className="fl-status">
            {skill}
            {canEdit && (
              <button
                type="button"
                aria-label={`Remove ${skill} from ${member.name ?? member.email}`}
                className="ml-1 align-middle opacity-60 hover:opacity-100"
                disabled={saving}
                onClick={() => onRemove(skill)}
              >
                <X size={10} />
              </button>
            )}
          </span>
        ))}
        {member.skills.length === 0 && <span className="text-2xs text-ink-low">No skills recorded</span>}
      </div>

      {canEdit && (
        <div className="mt-2.5">
          <div className="flex gap-1.5">
            <input
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  add(draft)
                }
              }}
              placeholder="Add a skill — free text"
              aria-label={`Add a skill for ${member.name ?? member.email}`}
              className="h-7 flex-1 rounded-md bg-recess px-2.5 text-xs text-ink outline-none placeholder:text-ink-low"
              disabled={saving}
            />
            <button
              type="button"
              className="fl-linkbtn"
              disabled={saving || !draft.trim()}
              onClick={() => add(draft)}
            >
              <Plus size={12} />
              Add
            </button>
          </div>
          {suggestions.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {suggestions.map(skill => (
                <button
                  key={skill}
                  type="button"
                  className={cn("fl-linkbtn")}
                  disabled={saving}
                  onClick={() => add(skill)}
                >
                  + {skill}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
