import { z } from "zod"
import { validators } from "@/lib/validation"
import type { ProfileStatus } from "@/lib/api/xvm-api"

export const CUSTOM = "custom"
export const NO_CLAN = "na"

export const RACES: Record<string, string> = {
  aura: "Au Ra",
  elezen: "Elezen",
  fantasia_addict: "Fantasia Addict",
  hrothgar: "Hrothgar",
  hyur: "Hyur",
  lalafell: "Lalafell",
  miqote: "Miqo'te",
  roegadyn: "Roegadyn",
  viera: "Viera",
  [CUSTOM]: "Custom",
}

export const CLANS: Record<string, string> = {
  dunesfolk: "Dunesfolk",
  duskwight: "Duskwight",
  helion: "Helion",
  hellsguard: "Hellsguard",
  highlander: "Highlander",
  keeper_of_the_moon: "Keeper of the Moon",
  midlander: "Midlander",
  plainsfolk: "Plainsfolk",
  raen: "Raen",
  rava: "Rava",
  sea_wolf: "Sea Wolf",
  seeker_of_the_sun: "Seeker of the Sun",
  the_lost: "The Lost",
  veena: "Veena",
  wildwood: "Wildwood",
  xaela: "Xaela",
  [CUSTOM]: "Custom",
  [NO_CLAN]: "NA",
}

const CLANS_BY_RACE: Record<string, readonly string[]> = {
  aura: ["raen", "xaela"],
  elezen: ["duskwight", "wildwood"],
  hrothgar: ["helion", "the_lost"],
  hyur: ["highlander", "midlander"],
  lalafell: ["dunesfolk", "plainsfolk"],
  miqote: ["keeper_of_the_moon", "seeker_of_the_sun"],
  roegadyn: ["hellsguard", "sea_wolf"],
  viera: ["rava", "veena"],
}

export const GENDERS: Record<string, string> = { male: "Male", female: "Female", non_binary: "Non-Binary", [CUSTOM]: "Custom" }

export const PRONOUNS: Record<string, string> = {
  he: "He",
  him: "Him",
  his: "His",
  she: "She",
  her: "Her",
  hers: "Hers",
  they: "They",
  them: "Them",
  theirs: "Theirs",
  ze: "Ze",
  hir: "Hir",
  per: "Per",
  pers: "Pers",
  it: "It",
  its: "Its",
}

export const ORIENTATIONS: Record<string, string> = {
  aromantic: "Aromantic",
  asexual: "Asexual",
  bisexual: "Bisexual",
  demiromantic: "Demiromantic",
  demisexual: "Demisexual",
  gay: "Gay",
  lesbian: "Lesbian",
  pansexual: "Pansexual",
  straight: "Straight",
  [CUSTOM]: "Custom",
}

export const SYNC_TOOLS: Record<string, string> = { mare: "Mare", playersync: "Playersync", [CUSTOM]: "Custom" }

export const STATUS_LABELS: Record<ProfileStatus, string> = {
  draft: "Draft",
  pending: "Waiting for review",
  approved: "Approved",
  rejected: "Rejected",
}

/** The clans a race offers, then Custom and NA. A race outside the list offers only those two. */
export function clanChoices(race: string | null): Record<string, string> {
  const keys = [...(race ? (CLANS_BY_RACE[race] ?? []) : []), CUSTOM, NO_CLAN]
  return Object.fromEntries(keys.map((key) => [key, CLANS[key]]))
}

/** Custom shows its own text, and a value the list does not know shows as it is stored. */
export function chosen(choices: Record<string, string>, value: string | null, custom: string | null): string | null {
  if (value === null || value === "") return null
  return value === CUSTOM ? custom : (choices[value] ?? value)
}

export function pronounKeys(stored: string | null): string[] {
  return (stored ?? "").split(",").filter((key) => key !== "")
}

/** Kept in the list's order, whatever order they were picked in, as the bot does. */
export function pronounsToString(picked: string[]): string | null {
  const keys = Object.keys(PRONOUNS).filter((key) => picked.includes(key))
  return keys.length === 0 ? null : keys.join(",")
}

export function pronounLabel(stored: string | null): string | null {
  const keys = pronounKeys(stored)
  return keys.length === 0 ? null : keys.map((key) => PRONOUNS[key] ?? key).join("/")
}

export const PROFILE_LIMITS = {
  characterName: 60,
  jobs: 80,
  rates: 250,
  likes: 500,
  dislikes: 500,
  personality: 300,
  aboutMe: 3000,
  age: 30,
  pairingCode: 30,
  choice: 32,
  custom: 50,
  world: 50,
  caption: 50,
  reason: 500,
} as const

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()

export const profileCreateSchema = z.object({ characterName: z.string().trim().min(1).max(PROFILE_LIMITS.characterName) })

export const PROFILE_TEXT_FIELDS = {
  jobs: "jobs",
  rates: "rates",
  dataCenter: "data_center",
  world: "world",
  gender: "gender",
  genderCustom: "gender_custom",
  pronouns: "pronouns",
  pronounsCustom: "pronouns_custom",
  race: "race",
  raceCustom: "race_custom",
  clan: "clan",
  clanCustom: "clan_custom",
  orientation: "orientation",
  orientationCustom: "orientation_custom",
  height: "height",
  age: "age",
  pairingCode: "pairing_code",
  pairingCodeType: "pairing_code_type",
  pairingCodeTypeCustom: "pairing_code_type_custom",
  likes: "likes",
  dislikes: "dislikes",
  personality: "personality",
  aboutMe: "about_me",
} as const

export const profileUpdateSchema = z
  .object({
    characterName: z.string().trim().min(1).max(PROFILE_LIMITS.characterName),
    color: z.number().int().min(0).max(0xffffff).nullable(),
    jobs: text(PROFILE_LIMITS.jobs),
    rates: text(PROFILE_LIMITS.rates),
    dataCenter: text(PROFILE_LIMITS.choice),
    world: text(PROFILE_LIMITS.world),
    gender: text(PROFILE_LIMITS.choice),
    genderCustom: text(PROFILE_LIMITS.custom),
    pronouns: text(200),
    pronounsCustom: text(PROFILE_LIMITS.custom),
    race: text(PROFILE_LIMITS.choice),
    raceCustom: text(PROFILE_LIMITS.custom),
    clan: text(PROFILE_LIMITS.choice),
    clanCustom: text(PROFILE_LIMITS.custom),
    orientation: text(PROFILE_LIMITS.choice),
    orientationCustom: text(PROFILE_LIMITS.custom),
    height: text(PROFILE_LIMITS.custom),
    age: text(PROFILE_LIMITS.age),
    pairingCode: text(PROFILE_LIMITS.pairingCode),
    pairingCodeType: text(PROFILE_LIMITS.choice),
    pairingCodeTypeCustom: text(PROFILE_LIMITS.custom),
    likes: text(PROFILE_LIMITS.likes),
    dislikes: text(PROFILE_LIMITS.dislikes),
    personality: text(PROFILE_LIMITS.personality),
    aboutMe: text(PROFILE_LIMITS.aboutMe),
  })
  .partial()
  .refine((data) => Object.values(data).some((value) => value !== undefined), { message: "Nothing to save" })

export const rejectSchema = z.object({ reason: z.string().trim().min(1).max(PROFILE_LIMITS.reason) })
export const imageUpdateSchema = z
  .object({
    caption: text(PROFILE_LIMITS.caption),
    sortOrder: z.number().int().min(0).max(2_147_483_647),
  })
  .partial()
  .refine((data) => Object.values(data).some((value) => value !== undefined), { message: "Nothing to save" })
export const postSchema = z.object({ channelId: validators.snowflake })
export const settingsSchema = z.object({ approvalRequired: z.boolean() })
