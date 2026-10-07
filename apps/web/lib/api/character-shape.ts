import type { MyCharacterRow } from "@/lib/api/xvm-api"

export interface CharacterShape {
  id: string
  characterName: string
  world: string
  isPrimary: boolean
}

export function toCharacterShape(row: MyCharacterRow): CharacterShape {
  return {
    id: String(row.id),
    characterName: row.character_name,
    world: row.world,
    isPrimary: row.is_primary,
  }
}
