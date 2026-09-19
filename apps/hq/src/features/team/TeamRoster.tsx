"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { LogOut, Plus, UserMinus, X } from "lucide-react"

import { apiErrorMessage, authApi, team, type DeviceSession, type TeamMember } from "@/lib/api"
import { ROLE_OPTIONS } from "@/lib/roles"
import { SKILLS } from "@/types"

/**
 * The Crews module: team management, not just skills. Owner/admin get the
 * roster's role controls, member removal and the lost-phone sign-out; every
 * signed-in member sees their own devices. Skills stay the core of each
 * row — they're what make a technician assignable to a job that declares a
 * `requiredSkill`.
 *
 * The API enforces every guard again server-side (last owner, self-edits,
 * owner boundaries); the controls here mirror those rules so the operator
 * sees the reason before clicking, and apiErrorMessage surfaces the API's
 * own words when a guard still trips.
 */
export function TeamRoster({ role }: { role: string | null }) {
  const canEdit = role === "owner" || role === "admin"
  const queryClient = useQueryClient()
  const members = useQuery({ queryKey: ["team-members"], queryFn: () => team.members() })
  const session = useQuery({ queryKey: ["hq-session"], queryFn: () => authApi.session() })
  // Invites are an owner/admin surface server-side — don't render a panel
  // that would only 403 for other office roles.
  const invites = useQuery({
    queryKey: ["team-invites"],
    queryFn: () => team.listInvites(),
    enabled: canEdit
  })
  const devices = useQuery({ queryKey: ["hq-sessions"], queryFn: () => authApi.sessions() })
  const [error, setError] = useState<string | null>(null)
  const selfId = session.data?.userId ?? null

  const invalidateTeam = () => {
    void queryClient.invalidateQueries({ queryKey: ["team-members"] })
    void queryClient.invalidateQueries({ queryKey: ["team-invites"] })
  }

  const fail = (fallback: string) => (err: unknown) => setError(apiErrorMessage(err, fallback))

  const save = useMutation({
    mutationFn: ({ userId, skills }: { userId: string; skills: string[] }) => team.setSkills(userId, skills),
    onSuccess: () => {
      setError(null)
      invalidateTeam()
    },
    onError: fail("Couldn't save the skills — try again.")
  })

  const changeRole = useMutation({
    mutationFn: ({ userId, nextRole }: { userId: string; nextRole: string }) => team.setRole(userId, nextRole),
    onSuccess: () => {
      setError(null)
      invalidateTeam()
    },
    onError: fail("Couldn't change their role — try again.")
  })

  const remove = useMutation({
    mutationFn: (userId: string) => team.removeMember(userId),
    onSuccess: () => {
      setError(null)
      invalidateTeam()
    },
    onError: fail("Couldn't remove them — try again.")
  })

  const signOut = useMutation({
    mutationFn: (userId: string) => team.signOutMember(userId),
    onSuccess: () => setError(null),
    onError: fail("Couldn't sign them out — try again.")
  })

  const revokeInvite = useMutation({
    mutationFn: (inviteId: string) => team.revokeInvite(inviteId),
    onSuccess: () => {
      setError(null)
      void queryClient.invalidateQueries({ queryKey: ["team-invites"] })
    },
    onError: fail("Couldn't revoke that invite — try again.")
  })

  const revokeDevice = useMutation({
    mutationFn: (device: DeviceSession) => authApi.revokeSession(device.id),
    onSuccess: (_data, device) => {
      setError(null)
      if (device.current) {
        // You just signed out THIS device — leave like the header's
        // sign-out button does, or the console sits on a dead session.
        void authApi
          .signOut()
          .catch(() => undefined)
          .finally(() => window.location.assign("/login"))
        return
      }
      void queryClient.invalidateQueries({ queryKey: ["hq-sessions"] })
    },
    onError: fail("Couldn't sign that device out — try again.")
  })

  const setSkills = (member: TeamMember, skills: string[]) => save.mutate({ userId: member.userId, skills })
  const busy = save.isPending || changeRole.isPending || remove.isPending || signOut.isPending

  return (
    <div className="scrollbar-thin h-full overflow-auto p-4" data-testid="team-roster">
      <div className="flex items-end justify-between">
        <div>
          <div className="label-mono text-2xs text-chrome-400">CREWS</div>
          <h2 className="mt-1 text-lg font-bold">Team roster</h2>
          <p className="mt-1 text-xs text-ink-mid">
            Skills decide who can take a job that needs one.
            {canEdit
              ? " Role changes apply on the member's next request."
              : " Only owners and admins can change them."}
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
            isSelf={member.userId === selfId}
            saving={busy}
            onAdd={skill => setSkills(member, [...member.skills, skill])}
            onRemove={skill => setSkills(member, member.skills.filter(s => s !== skill))}
            onRoleChange={nextRole => changeRole.mutate({ userId: member.userId, nextRole })}
            onRemoveMember={() => remove.mutate(member.userId)}
            onSignOut={() => signOut.mutate(member.userId)}
          />
        ))}
        {members.data && members.data.members.length === 0 && (
          <p className="text-xs text-ink-low">
            {canEdit ? "No one on the team yet — invite them from Setup." : "No one on the team yet."}
          </p>
        )}
      </div>

      {canEdit && (
        <section className="mt-6" data-testid="pending-invites">
          <div className="label-mono text-2xs text-chrome-400">PENDING INVITES</div>
          {invites.isLoading && <p className="mt-2 text-xs text-ink-low">Checking outstanding invites…</p>}
          {invites.error && (
            <p className="mt-2 text-xs text-pending">
              {apiErrorMessage(invites.error, "Couldn't load the invites.")}
            </p>
          )}
          {invites.data && invites.data.invites.length === 0 && (
            <p className="mt-2 text-xs text-ink-low">No invites outstanding — everyone invited has joined or lapsed.</p>
          )}
          <div className="mt-2 flex flex-col gap-2">
            {invites.data?.invites.map(invite => (
              <div key={invite.id} className="panel flex items-center justify-between gap-3 p-3" data-testid={`invite-${invite.id}`}>
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold">{invite.email}</div>
                  <div className="truncate text-2xs text-ink-low">
                    {invite.name ? `${invite.name} · ` : ""}
                    {invite.role} · sent {formatWhen(invite.createdAt)} · expires {formatWhen(invite.expiresAt)}
                  </div>
                </div>
                <button
                  type="button"
                  className="fl-linkbtn text-urgent"
                  disabled={revokeInvite.isPending}
                  onClick={() => revokeInvite.mutate(invite.id)}
                  data-testid={`revoke-invite-${invite.id}`}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6" data-testid="your-devices">
        <div className="label-mono text-2xs text-chrome-400">YOUR DEVICES</div>
        <p className="mt-1 text-2xs text-ink-low">Every signed-in session on your account in this organisation.</p>
        {devices.isLoading && <p className="mt-2 text-xs text-ink-low">Checking your devices…</p>}
        {devices.error && (
          <p className="mt-2 text-xs text-pending">
            {apiErrorMessage(devices.error, "Couldn't load your devices.")}
          </p>
        )}
        <div className="mt-2 flex flex-col gap-2">
          {devices.data?.sessions.map(device => (
            <div key={device.id} className="panel flex items-center justify-between gap-3 p-3" data-testid={`device-${device.id}`}>
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold">
                  {describeDevice(device.userAgent)}
                  {device.current && <span className="label-mono ml-2 text-2xs text-chrome-400">THIS DEVICE</span>}
                </div>
                <div className="truncate text-2xs text-ink-low">
                  Last seen {formatWhen(device.lastSeenAt)}
                  {device.ip ? ` · ${device.ip}` : ""}
                  {" · expires "}
                  {formatWhen(device.expiresAt)}
                </div>
              </div>
              <button
                type="button"
                className="fl-linkbtn text-urgent"
                disabled={revokeDevice.isPending}
                onClick={() => revokeDevice.mutate(device)}
                data-testid={`revoke-device-${device.id}`}
              >
                Sign out
              </button>
            </div>
          ))}
          {devices.data && devices.data.sessions.length === 0 && (
            <p className="text-xs text-ink-low">No live sessions found.</p>
          )}
        </div>
      </section>
    </div>
  )
}

/** Compact "Mar 4, 14:20"-style stamp — enough for an ops list, no
 *  relative-time library needed. */
function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

/** User-agent strings are long and noisy; show the useful middle. */
function describeDevice(userAgent: string | null): string {
  if (!userAgent) return "Unknown device"
  return userAgent.length > 60 ? `${userAgent.slice(0, 57)}…` : userAgent
}

function MemberRow({
  member,
  canEdit,
  isSelf,
  saving,
  onAdd,
  onRemove,
  onRoleChange,
  onRemoveMember,
  onSignOut
}: {
  member: TeamMember
  canEdit: boolean
  isSelf: boolean
  saving: boolean
  onAdd: (skill: string) => void
  onRemove: (skill: string) => void
  onRoleChange: (role: string) => void
  onRemoveMember: () => void
  onSignOut: () => void
}) {
  const [draft, setDraft] = useState("")
  // Two-step inline confirm for the irreversible action — never
  // window.confirm.
  const [confirmingRemove, setConfirmingRemove] = useState(false)
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
          <div className="truncate text-xs font-semibold">
            {member.name}
            {isSelf && <span className="label-mono ml-2 text-2xs text-chrome-400">YOU</span>}
          </div>
          <div className="truncate text-2xs text-ink-low">{member.email}</div>
        </div>
        {canEdit ? (
          <select
            value={member.role}
            disabled={saving || isSelf}
            title={isSelf ? "You can't change your own role — ask another owner." : `Set ${member.name}'s role`}
            aria-label={`Role for ${member.name}`}
            onChange={event => onRoleChange(event.target.value)}
            className="h-7 rounded-md bg-recess px-2 text-2xs font-semibold text-ink outline-none disabled:opacity-60"
            data-testid={`role-select-${member.userId}`}
          >
            {ROLE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="label-mono text-2xs text-chrome-400">{member.role.toUpperCase()}</span>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {member.skills.map(skill => (
          <span key={skill} className="fl-status">
            {skill}
            {canEdit && (
              <button
                type="button"
                aria-label={`Remove ${skill} from ${member.name}`}
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
              aria-label={`Add a skill for ${member.name}`}
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
                  className="fl-linkbtn"
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

      {canEdit && (
        <div className="mt-2.5 flex items-center justify-end gap-3 border-t border-line pt-2.5">
          {/* On your own row this revokes the session you're using right
              now — a dead console with no redirect. Point at Your devices,
              which handles that case honestly. */}
          <button
            type="button"
            className="fl-linkbtn"
            disabled={saving || isSelf}
            title={
              isSelf
                ? "This would sign out the console you're using — use Your devices below."
                : `Revoke every signed-in session for ${member.name}`
            }
            onClick={onSignOut}
            data-testid={`signout-${member.userId}`}
          >
            <LogOut size={12} />
            Sign out all devices
          </button>
          {isSelf ? (
            <span className="text-2xs text-ink-low" title="You can't remove your own account — ask another owner.">
              Can’t remove yourself
            </span>
          ) : confirmingRemove ? (
            <span className="flex items-center gap-2" data-testid={`confirm-remove-${member.userId}`}>
              <button
                type="button"
                className="fl-linkbtn text-urgent"
                disabled={saving}
                onClick={() => {
                  setConfirmingRemove(false)
                  onRemoveMember()
                }}
              >
                <UserMinus size={12} />
                Confirm remove
              </button>
              <button type="button" className="fl-linkbtn" onClick={() => setConfirmingRemove(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="fl-linkbtn text-urgent"
              disabled={saving}
              title={`Remove ${member.name} from the team`}
              onClick={() => setConfirmingRemove(true)}
              data-testid={`remove-${member.userId}`}
            >
              <UserMinus size={12} />
              Remove
            </button>
          )}
        </div>
      )}
    </section>
  )
}
