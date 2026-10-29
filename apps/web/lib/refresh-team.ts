import { revalidatePath, revalidateTag } from "next/cache"
import { TEAM_CACHE_TAG } from "@/lib/team-groups"

export function refreshTeamPage() {
  revalidateTag(TEAM_CACHE_TAG, { expire: 0 })
  revalidatePath("/team")
}
