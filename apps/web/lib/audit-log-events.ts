export const AUDIT_LOG_EVENT_KEYS = [
  "message.deleted",
  "message.edited",
  "member.joined",
  "member.left",
  "member.name_changed",
  "member.avatar_changed",
  "member.banned",
  "member.unbanned",
  "member.timed_out",
  "member.timeout_removed",
  "channel.created",
  "channel.updated",
  "channel.deleted",
  "role.created",
  "role.updated",
  "role.deleted",
  "server.updated",
  "emoji.updated",
  "voice.joined",
  "voice.moved",
  "voice.left",
] as const

export type AuditLogEventKey = (typeof AUDIT_LOG_EVENT_KEYS)[number]

export const AUDIT_LOG_EVENT_LABELS: Record<AuditLogEventKey, string> = {
  "message.deleted": "Message deleted",
  "message.edited": "Message edited",
  "member.joined": "Member joined",
  "member.left": "Member left",
  "member.name_changed": "Member renamed",
  "member.avatar_changed": "Member changed avatar",
  "member.banned": "Member banned",
  "member.unbanned": "Member unbanned",
  "member.timed_out": "Member timed out",
  "member.timeout_removed": "Timeout removed",
  "channel.created": "Channel created",
  "channel.updated": "Channel changed",
  "channel.deleted": "Channel deleted",
  "role.created": "Role created",
  "role.updated": "Role changed",
  "role.deleted": "Role deleted",
  "server.updated": "Server settings changed",
  "emoji.updated": "Emoji changed",
  "voice.joined": "Joined a voice channel",
  "voice.moved": "Moved between voice channels",
  "voice.left": "Left a voice channel",
}

export const AUDIT_LOG_EVENT_GROUPS: { label: string; keys: AuditLogEventKey[] }[] = [
  { label: "Messages", keys: ["message.deleted", "message.edited"] },
  {
    label: "Members",
    keys: [
      "member.joined",
      "member.left",
      "member.name_changed",
      "member.avatar_changed",
      "member.banned",
      "member.unbanned",
      "member.timed_out",
      "member.timeout_removed",
    ],
  },
  {
    label: "Channels and roles",
    keys: ["channel.created", "channel.updated", "channel.deleted", "role.created", "role.updated", "role.deleted"],
  },
  { label: "Server", keys: ["server.updated", "emoji.updated"] },
  { label: "Voice", keys: ["voice.joined", "voice.moved", "voice.left"] },
]

const DEFAULT_COLOR = 0x5865f2

export function colorToHex(color: number | null): string {
  return `#${(color ?? DEFAULT_COLOR).toString(16).padStart(6, "0")}`
}

export function hexToColor(hex: string): number {
  return parseInt(hex.slice(1), 16)
}
